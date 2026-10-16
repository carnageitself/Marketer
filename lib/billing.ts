// lib/billing.ts
// Usage against plan limits, and Stripe subscriptions (Checkout to subscribe,
// the customer portal to change or cancel, a webhook to keep users.plan in
// sync). Talks to Stripe's REST API directly, so there's no SDK dependency.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and one price id per plan and
// interval: STRIPE_PRICE_PRO_MONTH, STRIPE_PRICE_PRO_YEAR,
// STRIPE_PRICE_PREMIUM_MONTH, STRIPE_PRICE_PREMIUM_YEAR.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { one, q } from "./db";
import { planOf, type Interval, type PlanId } from "./plans";

// ── usage ───────────────────────────────────────────────────────────────────

export interface Usage { pageviews: number; sites: number; periodStart: string }

/** Page views this calendar month (UTC) across all of the user's websites. */
export async function usageOf(userId: string): Promise<Usage> {
  const r = await one<{ pageviews: number; sites: number; start: string }>(
    `select (select count(*)::int from pageviews p join sites s on s.id = p.site_id
               where s.user_id = $1 and s.demo_of is null and p.ts >= date_trunc('month', now())) as pageviews,
            (select count(*)::int from sites where user_id = $1 and demo_of is null) as sites,
            to_char(date_trunc('month', now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start`,
    [userId]);
  return { pageviews: r?.pageviews ?? 0, sites: r?.sites ?? 0, periodStart: r?.start ?? "" };
}

export async function accountOf(user: { id: string; plan: string }) {
  return { plan: planOf(user.plan).id, usage: await usageOf(user.id), payments: !!stripeKey() };
}

// ── Stripe ──────────────────────────────────────────────────────────────────

const stripeKey = () => process.env.STRIPE_SECRET_KEY || null;
const PRICE_ENV: Record<string, string> = {
  "pro:month": "STRIPE_PRICE_PRO_MONTH", "pro:year": "STRIPE_PRICE_PRO_YEAR",
  "premium:month": "STRIPE_PRICE_PREMIUM_MONTH", "premium:year": "STRIPE_PRICE_PREMIUM_YEAR",
};
const priceId = (plan: PlanId, interval: Interval) => process.env[PRICE_ENV[`${plan}:${interval}`]] || null;

/** Price id → plan, for webhook events. */
function planForPrice(id: string | undefined): PlanId | null {
  for (const [k, env] of Object.entries(PRICE_ENV)) if (id && process.env[env] === id) return k.split(":")[0] as PlanId;
  return null;
}

async function stripe<T = Record<string, unknown>>(path: string, body?: Record<string, string>): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("Payments aren't set up on this server yet");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe error ${res.status}`);
  return data;
}

interface Billing { customerId?: string; subscriptionId?: string; status?: string; interval?: Interval; periodEnd?: string }

export async function checkoutUrl(user: { id: string; email: string }, plan: PlanId, interval: Interval, origin: string): Promise<string> {
  const price = priceId(plan, interval);
  if (!price) throw new Error(`No Stripe price is configured for ${plan} (${interval}ly)`);
  const b = (await one<{ billing: Billing }>("select billing from users where id = $1", [user.id]))?.billing ?? {};
  const s = await stripe<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price, "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    "subscription_data[metadata][user_id]": user.id,
    ...(b.customerId ? { customer: b.customerId } : { customer_email: user.email }),
    allow_promotion_codes: "true",
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  });
  return s.url;
}

export async function portalUrl(userId: string, origin: string): Promise<string> {
  const b = (await one<{ billing: Billing }>("select billing from users where id = $1", [userId]))?.billing ?? {};
  if (!b.customerId) throw new Error("You don't have a subscription yet");
  const s = await stripe<{ url: string }>("billing_portal/sessions", { customer: b.customerId, return_url: `${origin}/billing` });
  return s.url;
}

/** Verifies the Stripe-Signature header (HMAC-SHA256 of "<t>.<body>", 5 min tolerance). */
export function verifyWebhook(raw: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const want = createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  return header.split(",").filter(p => p.startsWith("v1=")).some(p => {
    const got = Buffer.from(p.slice(3), "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

interface Sub { id: string; customer: string; status: string; metadata?: { user_id?: string }; items: { data: { price: { id: string; recurring?: { interval?: Interval } }; current_period_end?: number }[] }; current_period_end?: number }

/** Mirrors a subscription onto users.plan; ended or unpaid subscriptions fall back to Free. */
async function syncSubscription(sub: Sub, userId?: string) {
  const uid = userId ?? sub.metadata?.user_id
    ?? (await one<{ id: string }>(`select id from users where billing->>'customerId' = $1`, [sub.customer]))?.id;
  if (!uid) return;
  const item = sub.items.data[0];
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const plan = active ? planForPrice(item?.price.id) ?? "free" : "free";
  const end = item?.current_period_end ?? sub.current_period_end;
  const billing: Billing = {
    customerId: sub.customer, subscriptionId: sub.id, status: sub.status,
    interval: item?.price.recurring?.interval, periodEnd: end ? new Date(end * 1000).toISOString() : undefined,
  };
  await q("update users set plan = $2, billing = $3::text::jsonb where id = $1", [uid, plan, JSON.stringify(billing)]);
}

export async function handleEvent(event: { type: string; data: { object: Record<string, unknown> } }) {
  const o = event.data.object;
  if (event.type === "checkout.session.completed" && typeof o.subscription === "string") {
    await syncSubscription(await stripe<Sub>(`subscriptions/${o.subscription}`), (o.client_reference_id as string) ?? undefined);
  } else if (event.type.startsWith("customer.subscription.")) {
    await syncSubscription(o as unknown as Sub);
  }
}
