// app/api/billing/route.ts
// POST { action: "checkout", plan, interval } → { url } of a Stripe Checkout page
// POST { action: "portal" }                   → { url } of the Stripe customer portal
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { checkoutUrl, portalUrl } from "@/lib/billing";
import type { Interval, PlanId } from "@/lib/plans";
import { appOrigin } from "@/lib/sites";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string; plan?: PlanId; interval?: Interval };
  try {
    if (body.action === "portal") return NextResponse.json({ url: await portalUrl(user.id, appOrigin(req)) });
    if (body.action === "checkout" && (body.plan === "pro" || body.plan === "premium")) {
      return NextResponse.json({ url: await checkoutUrl(user, body.plan, body.interval === "year" ? "year" : "month", appOrigin(req)) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
