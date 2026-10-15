"use client";
// The plan cards, on the public landing page (links to sign-up) and on the
// billing page (starts Stripe Checkout or opens the customer portal).
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icons";
import { PLANS, PLAN_ORDER, type Interval, type PlanId } from "@/lib/plans";

export default function Pricing({ current, payments = true }: { current?: PlanId; payments?: boolean }) {
  const [interval, setInterval] = useState<Interval>("year");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  const account = current !== undefined;

  async function choose(plan: PlanId) {
    setBusy(plan); setError("");
    const toPortal = plan === "free" || (current !== "free" && current !== undefined);
    const res = await fetch("/api/billing", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(toPortal ? { action: "portal" } : { action: "checkout", plan, interval }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.url) { window.location.assign(d.url); return; }
    setError(d.error ?? "Something went wrong"); setBusy(null);
  }

  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-panel p-1 shadow-card">
          {(["month", "year"] as const).map(i => (
            <button key={i} onClick={() => setInterval(i)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${interval === i ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>
              {i === "month" ? "Monthly" : <>Yearly <span className={interval === i ? "text-good-soft" : "text-good"}>· save 20%</span></>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map(id => {
          const p = PLANS[id];
          const hot = id === "pro";
          const isCurrent = current === id;
          const price = p.price[interval];
          return (
            <div key={id} className={`relative flex min-w-0 flex-col rounded-2xl border bg-panel p-6 shadow-card sm:p-7 ${hot ? "border-accent ring-1 ring-accent" : "border-line"}`}>
              {hot && <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-[11.5px] font-semibold text-on-accent">Most popular</span>}
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold">{p.name}</h3>
                {isCurrent && <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11.5px] font-medium text-good">Current plan</span>}
              </div>
              <p className="mt-1 text-[13px] text-muted">{p.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-[40px] font-semibold leading-none tracking-tight">${price}</span>
                <span className="text-[13px] text-muted">/ month</span>
              </div>
              <div className="mt-1.5 h-4 text-[12px] text-muted">
                {price > 0 && (interval === "year" ? `$${price * 12} billed yearly` : `or $${p.price.year}/mo billed yearly`)}
              </div>

              {account ? (
                <button disabled={isCurrent || busy !== null || (!payments && id !== "free")} onClick={() => choose(id)}
                  className={`mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-[13.5px] font-medium transition disabled:opacity-50 ${hot ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-line bg-panel hover:bg-panel-2"}`}>
                  {isCurrent ? "Your plan" : busy === id ? "Opening…" : id === "free" ? "Downgrade" : current === "free" ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                </button>
              ) : (
                <Link href="/login?mode=signup" className={`mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-[13.5px] font-medium transition ${hot ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-line bg-panel hover:bg-panel-2"}`}>
                  {id === "free" ? "Start free" : `Start with ${p.name}`}<Icon name="arrowRight" size={14} />
                </Link>
              )}

              <ul className="mt-6 space-y-2.5 text-[13px]">
                {p.features.map(f => (
                  <li key={f} className="flex gap-2.5"><Icon name="check" size={15} strokeWidth={2.5} className="mt-0.5 text-accent" />{f}</li>
                ))}
                {p.soon?.map(f => (
                  <li key={f} className="flex gap-2.5 text-muted"><Icon name="sparkle" size={15} className="mt-0.5 text-faint" />{f}<span className="ml-auto shrink-0 rounded bg-panel-2 px-1.5 text-[10.5px] font-medium uppercase tracking-wide text-faint">Soon</span></li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-4 text-center text-[13px] text-bad">{error}</p>}
      {account && !payments && <p className="mt-4 text-center text-[12.5px] text-muted">Payments aren&apos;t switched on for this server yet (set the Stripe keys).</p>}
    </div>
  );
}
