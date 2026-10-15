"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty, fmt } from "./ui";

interface SiteRow {
  id: string; domain: string; installed_at: string | null; verified_at: string | null; visitors_24h: number; live: number;
  scan: { platform?: { name: string } | null; dnsProvider?: { name: string } | null };
}

export default function SitesList({ initial }: { initial: SiteRow[] }) {
  const [sites] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/sites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Couldn't add that site"); setBusy(false); return; }
    window.location.href = `/sites/${data.site.id}/setup`;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold">Your websites</h1>
      <form onSubmit={add} className="mt-4 flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 sm:flex-row">
        <input value={url} onChange={e => setUrl(e.target.value)} required placeholder="Paste your website, e.g. example.com"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
        <Button type="submit" disabled={busy} className="py-2.5">{busy ? "Scanning your domain…" : "Add website"}</Button>
      </form>
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
      <p className="mt-2 text-[12px] text-muted">We look up its DNS, hosting and platform automatically, then give you the exact install steps.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map(s => (
          <div key={s.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{s.domain}</div>
                <div className="mt-0.5 text-[12px] text-muted">{[s.scan?.platform?.name, s.scan?.dnsProvider?.name].filter(Boolean).join(" · ") || "Not scanned"}</div>
              </div>
              {s.installed_at ? <Badge tone="good">● Receiving data</Badge> : <Badge tone="bad">Waiting for install</Badge>}
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="tabular text-[22px] font-semibold">{fmt.n(s.visitors_24h)}</div>
                <div className="text-[12px] text-muted">visitors, last 24h{s.live ? ` · ${s.live} live now` : ""}</div>
              </div>
              <div className="flex gap-2">
                <Link href={`/sites/${s.id}/setup`} className="rounded-lg border border-line px-3 py-1.5 text-[12px]">Setup</Link>
                <Link href={`/sites/${s.id}`} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] text-on-accent">Dashboard</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!sites.length && <Empty>No websites yet. Add your first one above.</Empty>}
    </main>
  );
}
