"use client";
import Link from "next/link";
import { useState } from "react";
import AppShell, { type Account } from "./AppShell";
import { Icon } from "./icons";
import { Badge, Button, PageHeader, field, fmt } from "./ui";

interface SiteRow {
  id: string; domain: string; installed_at: string | null; verified_at: string | null; visitors_24h: number; live: number; role?: string; owner_email?: string;
  scan: { platform?: { name: string } | null; dnsProvider?: { name: string } | null; host?: { name: string } | null };
}

export default function SitesList({ initial, email, account }: { initial: SiteRow[]; email: string; account: Account }) {
  const [sites] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/sites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Couldn't add that site"); setUpgrade(res.status === 402); setBusy(false); return; }
    window.location.href = `/sites/${data.site.id}/setup`;
  }

  return (
    <AppShell email={email} active="sites" account={account}>
      <PageHeader title="Websites" subtitle={sites.length ? `${sites.length} website${sites.length === 1 ? "" : "s"} · last 24 hours` : "Add a website to start measuring it."} />

      <form onSubmit={add} className="rounded-xl border border-line bg-panel p-5 shadow-card">
        <label className="text-[13.5px] font-semibold" htmlFor="site-url">Add a website</label>
        <p className="mt-0.5 text-[12.5px] text-muted">We look up its DNS, hosting and platform, then give you the exact install steps.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Icon name="sources" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input id="site-url" value={url} onChange={e => setUrl(e.target.value)} required placeholder="example.com"
              className={`${field} h-10 w-full pl-9 text-[14px]`} />
          </div>
          <Button type="submit" disabled={busy} className="h-10">{busy ? <><Icon name="refresh" size={14} className="animate-spin" />Scanning your domain…</> : <><Icon name="plus" size={14} />Add website</>}</Button>
        </div>
        {error && <p className="mt-2 text-[13px] text-bad">{error}{upgrade && <> <a href="/billing" className="font-medium text-accent hover:underline">See plans →</a></>}</p>}
      </form>

      {!!sites.length && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sites.map(s => (
            <Link key={s.id} href={`/sites/${s.id}`} className="group flex flex-col rounded-xl border border-line bg-panel p-5 shadow-card transition hover:border-line-strong hover:shadow-pop">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[15px] font-semibold uppercase text-accent">{s.domain[0]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">{s.domain}</div>
                  <div className="mt-0.5 truncate text-[12px] text-muted">{s.role && s.role !== "owner" ? <>Shared by {s.owner_email} · <span className="capitalize">{s.role}</span></> : [s.scan?.platform?.name, s.scan?.host?.name ?? s.scan?.dnsProvider?.name].filter(Boolean).join(" · ") || "Not scanned"}</div>
                </div>
                {s.installed_at ? <Badge tone="good" dot={!!s.live}>{s.live ? `${s.live} live` : "Active"}</Badge> : <Badge tone="warn">Not installed</Badge>}
              </div>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <div className="tabular text-[26px] font-semibold leading-none tracking-tight">{fmt.n(s.visitors_24h)}</div>
                  <div className="mt-1.5 text-[12px] text-muted">visitors in the last 24h</div>
                </div>
                <div className="flex items-center gap-3 text-[12.5px] font-medium">
                  {!s.installed_at && (
                    <span role="link" tabIndex={0} className="text-accent hover:underline"
                      onClick={e => { e.preventDefault(); window.location.href = `/sites/${s.id}/setup`; }}>Finish setup</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-muted transition group-hover:text-ink">Dashboard<Icon name="arrowRight" size={13} className="transition group-hover:translate-x-0.5" /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
