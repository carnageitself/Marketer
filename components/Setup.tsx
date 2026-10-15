"use client";
// The onboarding screen: what we found, how to install, and DNS — with live
// status that updates on its own, so the user never has to press "verify".
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Code, CopyButton, fmt } from "./ui";
import { GUIDES, guideFor } from "./install-guides";

interface ProviderSpec { label: string; fields: { key: string; label: string; secret?: boolean; optional?: boolean }[]; help: string; url: string }
interface Rec { type: string; name: string; fqdn: string; value: string; purpose: string; live?: boolean; found?: string[] }
interface SiteT {
  id: string; domain: string; installed_at: string | null; verified_at: string | null;
  scan: {
    scannedAt?: string; reachable?: boolean; finalUrl?: string; error?: string; cloudflareProxied?: boolean; scriptFound?: boolean;
    dnsProvider?: { id: string; name: string; auto: boolean; nameservers: string[] } | null;
    host?: { id: string; name: string } | null; platform?: { id: string; name: string } | null;
  };
  dns: { subdomain?: string; cnameVerifiedAt?: string; worker?: { script: string; installedAt: string }; log?: { at: string; text: string; ok: boolean }[] };
}
interface Info { site: SiteT; snippet: string; origin: string; records: Rec[]; cnameAvailable: boolean; providerFields: Record<string, ProviderSpec>; providerLink: string | null }
interface Check { records: Rec[]; installed: boolean; scriptOnHomepage: boolean | null; visits: number; lastSeen: string | null; site: SiteT }

export default function Setup({ initial }: { initial: Info }) {
  const siteId = initial.site.id;
  const [info, setInfo] = useState<Info>(initial);
  const [check, setCheck] = useState<Check | null>(null);
  const [guide, setGuide] = useState(() => guideFor(initial.site.scan.platform?.id));
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}`);
    if (!res.ok) return;
    const data: Info = await res.json();
    setInfo(data);
  }, [siteId]);

  const runCheck = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/check`, { method: "POST" });
    if (res.ok) {
      const c: Check = await res.json();
      setCheck(c);
      setInfo(i => (i ? { ...i, site: c.site } : i));
    }
  }, [siteId]);

  // Check right away, then keep checking on our own until everything is green.
  const done = !!check?.installed && (check?.records ?? []).every(r => r.live);
  useEffect(() => {
    if (done) return;
    const first = setTimeout(runCheck, 0);
    const t = setInterval(runCheck, 8000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [done, runCheck]);

  const { site } = info;
  const scan = site.scan;
  const records = check?.records ?? info.records;
  const g = GUIDES.find(x => x.id === guide) ?? GUIDES[GUIDES.length - 1];
  const provider = scan.dnsProvider;
  const spec = provider ? info.providerFields[provider.id] : undefined;

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Set up {site.domain}</h1>
          <p className="text-[13px] text-muted">Everything below updates on its own. You don&apos;t need to press verify.</p>
        </div>
        <Link href={`/sites/${site.id}`} className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-on-accent">Open dashboard →</Link>
      </div>

      {/* 1 — scan */}
      <Card title="1 · What we found" action={
        <Button variant="ghost" disabled={scanning} onClick={async () => {
          setScanning(true);
          await fetch(`/api/sites/${site.id}/scan`, { method: "POST" });
          await load(); setScanning(false);
        }}>{scanning ? "Scanning…" : "Scan again"}</Button>
      }>
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="DNS provider" value={provider?.name ?? "Not found"} sub={provider ? (provider.auto ? "We can set records up for you" : "Records are added by hand (2 min)") : scan.error} />
          <Fact label="Hosting" value={scan.host?.name ?? "Unknown"} sub={scan.cloudflareProxied ? "Behind Cloudflare's proxy" : undefined} />
          <Fact label="Built with" value={scan.platform?.name ?? (scan.reachable ? "Custom" : "Couldn't load the site")} sub={scan.finalUrl} />
        </div>
        {provider?.nameservers?.length ? <p className="mt-3 text-[12px] text-muted">Nameservers: {provider.nameservers.join(", ")}</p> : null}
      </Card>

      {/* 2 — install */}
      <Card title="2 · Add the tracker" action={<InstallStatus check={check} />}>
        <div className="space-y-4">
          {scan.cloudflareProxied && <CloudflareWorker site={site} spec={info.providerFields.cloudflare} onDone={load} />}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium">Your tag</span>
              <CopyButton text={info.snippet} />
            </div>
            <Code>{info.snippet}</Code>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap gap-1">
              {GUIDES.map(x => (
                <button key={x.id} onClick={() => setGuide(x.id)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${guide === x.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}>
                  {x.name}{scan.platform?.id && guideFor(scan.platform.id) === x.id ? " · detected" : ""}
                </button>
              ))}
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-[13px]">
              {g.steps(info.snippet, site.id, info.origin).map(s => <li key={s}>{s}</li>)}
            </ol>
            {g.code && <div className="mt-2"><Code>{g.code(info.snippet, site.id, info.origin)}</Code></div>}
            {g.id === "wordpress" && (
              <a href={`/api/sites/${site.id}/wordpress`} className="mt-3 inline-flex rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-on-accent">Download WordPress plugin</a>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-line p-3 text-[13px]">
            <b>Just trying it out?</b> Open our <a className="text-accent" href={`/demo/${site.id}`} target="_blank" rel="noreferrer">demo website</a>.
            It has this site&apos;s tag on it, so you can click around, scroll and watch data arrive in your dashboard.
          </div>
        </div>
      </Card>

      {/* 3 — DNS */}
      <Card title="3 · Connect your domain" action={site.verified_at ? <Badge tone="good">✓ Verified</Badge> : <Badge>Optional · recommended</Badge>}>
        <p className="mb-3 text-[13px] text-muted">
          Proves you own {site.domain}{info.cnameAvailable ? ` and serves the tracker from your own subdomain, so ad blockers don't drop your numbers` : ""}.
          {!info.cnameAvailable && " (First-party tracking turns on once Pagewise is deployed with a CNAME_TARGET.)"}
        </p>
        <RecordsTable records={records} />
        {provider && spec ? (
          <AutoDns site={site} provider={provider.id} spec={spec} onDone={() => { load(); runCheck(); }} />
        ) : (
          <p className="mt-3 text-[13px]">
            Add {records.length > 1 ? "these records" : "this record"} in {provider?.name ?? "your DNS provider"}&apos;s dashboard
            {info.providerLink && <> (<a className="text-accent" href={info.providerLink} target="_blank" rel="noreferrer">open it</a>)</>}. We&apos;ll spot it automatically, usually within a few minutes.
          </p>
        )}
        {!!site.dns.log?.length && (
          <div className="mt-4 space-y-1 border-t border-line pt-3">
            {[...site.dns.log].reverse().slice(0, 8).map((l, i) => (
              <div key={i} className="flex gap-2 text-[12px]">
                <span className={l.ok ? "text-good" : "text-bad"}>{l.ok ? "✓" : "✗"}</span>
                <span className="flex-1">{l.text}</span>
                <span className="text-muted">{fmt.ago(l.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-[14px] font-semibold">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-muted" title={sub}>{sub}</div>}
    </div>
  );
}

function InstallStatus({ check }: { check: Check | null }) {
  if (!check) return <Badge>Checking…</Badge>;
  if (check.installed) return <Badge tone="good">● Receiving data · {fmt.n(check.visits)} visits{check.lastSeen ? ` · last ${fmt.ago(check.lastSeen)}` : ""}</Badge>;
  if (check.scriptOnHomepage) return <Badge tone="accent">Tag found on your homepage, waiting for the first visit…</Badge>;
  return <Badge tone="bad">Waiting for the tag…</Badge>;
}

function RecordsTable({ records }: { records: Rec[] }) {
  return (
    <div className="space-y-2">
      {records.map(r => (
        <div key={r.fqdn} className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px]"><b>{r.type}</b> <span className="font-mono">{r.name}</span> <span className="text-muted">· {r.purpose}</span></div>
            {r.live ? <Badge tone="good">✓ Live</Badge> : <Badge>Not found yet</Badge>}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-panel-2 px-2 py-1 font-mono text-[12px]" title={r.value}>{r.value}</code>
            <CopyButton text={r.value} label="Copy value" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CredFields({ spec, values, set }: { spec: ProviderSpec; values: Record<string, string>; set: (k: string, v: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {spec.fields.map(f => (
        <input key={f.key} type={f.secret ? "password" : "text"} placeholder={f.label + (f.optional ? " (optional)" : "")} value={values[f.key] ?? ""}
          onChange={e => set(f.key, e.target.value)} autoComplete="off"
          className="rounded-lg border border-line bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent" />
      ))}
    </div>
  );
}

function AutoDns({ site, provider, spec, onDone }: { site: SiteT; provider: string; spec: ProviderSpec; onDone: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="mt-4 rounded-lg bg-accent-soft p-3">
      <div className="text-[13px] font-medium">Set it up automatically with {spec.label}</div>
      <p className="mt-1 text-[12px] text-muted">{spec.help} <a className="text-accent" href={spec.url} target="_blank" rel="noreferrer">Create one →</a> The token is used once and never stored.</p>
      <div className="mt-2"><CredFields spec={spec} values={creds} set={(k, v) => setCreds(c => ({ ...c, [k]: v }))} /></div>
      <div className="mt-2 flex items-center gap-3">
        <Button disabled={busy} onClick={async () => {
          setBusy(true); setMsg("");
          const res = await fetch(`/api/sites/${site.id}/dns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records", provider, creds }) });
          const d = await res.json().catch(() => ({}));
          setBusy(false); setCreds({});
          setMsg(res.ok ? (d.logs ?? []).every((l: { ok: boolean }) => l.ok) ? "Done. Records created; they usually go live within a minute." : "Some records couldn't be created; see the log below." : d.error ?? "Failed");
          onDone();
        }}>{busy ? "Configuring…" : "Configure DNS for me"}</Button>
        {msg && <span className="text-[12px]">{msg}</span>}
      </div>
    </div>
  );
}

function CloudflareWorker({ site, spec, onDone }: { site: SiteT; spec: ProviderSpec; onDone: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const installed = !!site.dns.worker;
  const go = async (action: "worker" | "worker_remove") => {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/sites/${site.id}/dns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, provider: "cloudflare", creds }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false); setCreds({});
    setMsg(res.ok ? (action === "worker" ? "Installed. Every page now carries the tag; no code change needed." : "Removed.") : d.error ?? "Failed");
    onDone();
  };
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium">⚡ Install with zero code (your site runs through Cloudflare)</div>
        {installed && <Badge tone="good">Installed</Badge>}
      </div>
      <p className="mt-1 text-[12px] text-muted">
        We deploy a tiny Cloudflare Worker that adds the tag to every HTML page as it&apos;s served. Your site&apos;s code isn&apos;t touched, and you can remove it any time.
        Token needs Workers Scripts → Edit, Workers Routes → Edit and Zone → Read. <a className="text-accent" href={spec.url} target="_blank" rel="noreferrer">Create one →</a>
      </p>
      <div className="mt-2"><CredFields spec={spec} values={creds} set={(k, v) => setCreds(c => ({ ...c, [k]: v }))} /></div>
      <div className="mt-2 flex items-center gap-2">
        {!installed && <Button disabled={busy} onClick={() => go("worker")}>{busy ? "Installing…" : "Install automatically"}</Button>}
        {installed && <Button variant="danger" disabled={busy} onClick={() => go("worker_remove")}>{busy ? "Removing…" : "Remove Worker"}</Button>}
        {msg && <span className="text-[12px]">{msg}</span>}
      </div>
    </div>
  );
}
