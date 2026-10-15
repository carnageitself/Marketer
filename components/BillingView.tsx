"use client";
import { useEffect, useState } from "react";
import AppShell, { type Account } from "./AppShell";
import Pricing from "./Pricing";
import { Icon } from "./icons";
import { Card, PageHeader } from "./ui";
import { PLANS, fmtViews } from "@/lib/plans";

export default function BillingView({ email, account, billing }: { email: string; account: Account; billing: { status?: string; interval?: string; periodEnd?: string } }) {
  const plan = PLANS[account.plan];
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("checkout");
    if (!c) return;
    const t = setTimeout(() => setNotice(c === "success" ? "Thanks! Your plan is active. It can take a few seconds to show here." : "Checkout was cancelled, so nothing changed."), 0);
    history.replaceState(null, "", "/billing");
    return () => clearTimeout(t);
  }, []);

  const meters = [
    { label: "Page views this month", used: account.usage.pageviews, limit: plan.limits.pageviews, show: (n: number) => n.toLocaleString("en-US"), cap: fmtViews(plan.limits.pageviews) },
    { label: "Websites", used: account.usage.sites, limit: plan.limits.sites, show: (n: number) => String(n), cap: String(plan.limits.sites) },
  ];

  return (
    <AppShell email={email} active="billing" account={account}>
      <PageHeader title="Plan & billing" subtitle="Your plan, what you've used this month, and upgrades." />
      {notice && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-good/25 bg-good-soft px-4 py-3 text-[13px]">
          <Icon name="check" size={16} className="text-good" /><span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink"><Icon name="close" size={14} /></button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Current plan">
          <div className="text-[24px] font-semibold tracking-tight">{plan.name}</div>
          <p className="mt-1 text-[13px] text-muted">{plan.tagline}</p>
          <div className="mt-4 space-y-1 text-[13px]">
            <div><span className="text-muted">History: </span>{plan.limits.historyDays >= 365 ? `${Math.round(plan.limits.historyDays / 365)} years` : `${plan.limits.historyDays} days`}</div>
            {billing.periodEnd && <div><span className="text-muted">{billing.status === "canceled" ? "Ends" : "Renews"}: </span>{new Date(billing.periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}{billing.interval ? ` (${billing.interval}ly)` : ""}</div>}
          </div>
        </Card>
        {meters.map(m => {
          const pct = Math.min(100, (m.used / m.limit) * 100);
          const over = m.used > m.limit;
          return (
            <Card key={m.label} title={m.label}>
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-[24px] font-semibold tracking-tight">{m.show(m.used)}</span>
                <span className="text-[13px] text-muted">of {m.cap}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel-2">
                <div className={`h-full rounded-full ${over ? "bg-bad" : pct > 80 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className={`mt-2 text-[12.5px] ${over ? "text-bad" : "text-muted"}`}>
                {over ? "Over your plan. We keep collecting, so you lose nothing, but please upgrade."
                  : m.used >= m.limit ? "At your plan's limit." : pct > 80 ? "Close to your plan's limit." : `${Math.round(pct)}% used`}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <h2 className="text-[22px] font-semibold tracking-tight">Plans</h2>
        <p className="mt-1 text-[13px] text-muted">Change or cancel any time. Upgrades apply straight away.</p>
      </div>
      <div className="mt-6"><Pricing current={account.plan} payments={account.payments} /></div>
    </AppShell>
  );
}
