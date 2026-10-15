// app/api/billing/webhook/route.ts
// Stripe → us: subscription created, changed or cancelled. Point a Stripe
// webhook at <APP_URL>/api/billing/webhook with the checkout.session.completed
// and customer.subscription.* events, and set STRIPE_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { handleEvent, verifyWebhook } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"))) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  try {
    await handleEvent(JSON.parse(raw));
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[billing webhook]", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
