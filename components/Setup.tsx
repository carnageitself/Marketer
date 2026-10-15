"use client";
// The onboarding screen: what we found, how to install, and DNS — with live
// status that updates on its own, so the user never has to press "verify".
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import AppShell from "./AppShell";
import { Icon, type IconName } from "./icons";
import { Badge, Button, Card, Code, CopyButton, PageHeader, field, fmt } from "./ui";
import { GUIDES, guideFor } from "./install-guides";

interface ProviderSpec { label: string; fields: { key: string; label: string; secret?: boolean; optional?: boolean }[]; help: string; url: string }
interface Rec { type: string; name: string; fqdn: string; value: string; purpose: string; live?: boolean; found?: string[] }
interface SiteT {
  id: string; domain: string; installed_at: string | null; verified_at: string | null;
  scan: {
    scannedAt?: string; reachable?: boolean; finalUrl?: string; error?: string; cloudflareProxied?: boolean; scriptFound?: boolean;
    dnsProvider?: { id: string; name: string; auto: boolean; nameservers: string[] } | null;
    host?: { id: string; name: string } | null; platform?: { id: string; name: string } | null;
    records?: { a: string[]; cname: string[]; wwwCname: string[] };
    domainConnect?: { providerId: string; providerName: string; supported: boolean } | null;
  };
  dns: { subdomain?: string; cnameVerifiedAt?: string; worker?: { script: string; installedAt: string }; log?: { at: string; text: string; ok: boolean }[] };
}
interface Info { site: SiteT; snippet: string; origin: string; records: Rec[]; cnameAvailable: boolean; providerFields: Record<string, ProviderSpec>; providerLink: string | null; signIn: { cloudflare: boolean } }
interface Check { records: Rec[]; installed: boolean; scriptOnHomepage: boolean | null; visits: number; lastSeen: string | null; site: SiteT }

export default function Setup({ initial, email }: { initial: Info; email: string }) {
  const siteId = initial.site.id;
  const [info, setInfo] = useState<Info>(initial);
  const [check, setCheck] = useState<Check | null>(null);
  const [guide, setGuide] = useState(() => guideFor(initial.site.scan.platform?.id));
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  // Result of a "sign in to your DNS provider" round trip, passed back in the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("connect");
    if (!c) return;
    const t = setTimeout(() => setNotice({ ok: c === "ok", msg: p.get("msg") ?? "" }), 0);
    history.replaceState(null, "", window.location.pathname);
    return () => clearTimeout(t);
  }, []);

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
  const installed = !!(check?.installed ?? site.installed_at);
  const steps = [
    { label: "Scan your domain", done: !!scan.scannedAt && (!!scan.reachable || !!provider) },
    { label: "Add the tracker", done: installed },
    { label: "Verify your domain", done: !!site.verified_at, optional: true },
  ];
  const doneCount = steps.filter(s => s.done).length;
  // Best sign-in route for DNS: Cloudflare OAuth, else Domain Connect at their provider.
  const signIn = provider?.id === "cloudflare" && info.signIn.cloudflare ? { via: "cloudflare", name: "Cloudflare" }
    : scan.domainConnect?.supported ? { via: "domainconnect", name: scan.domainConnect.providerName } : null;
  const connectHref = (via: string, intent: string) => `/api/connect/start?site=${site.id}&via=${via}&intent=${intent}`;

  return (
    <AppShell email={email} site={site} active="setup">
      <PageHeader title={`Set up ${site.domain}`} subtitle="Everything on this page updates on its own. There's no verify button to press."
        actions={<Link href={`/sites/${site.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-on-accent shadow-card hover:bg-accent-hover">Open dashboard<Icon name="arrowRight" size={14} /></Link>} />

      {notice && (
        <div className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] ${notice.ok ? "border-good/25 bg-good-soft" : "border-bad/25 bg-bad-soft"}`}>
          <Icon name={notice.ok ? "check" : "close"} size={16} className={`mt-0.5 ${notice.ok ? "text-good" : "text-bad"}`} />
          <span className="flex-1">{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="text-muted hover:text-ink" aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* 1 — scan */}
          <Step n={1} done={steps[0].done} title="What we found" subtitle={scan.scannedAt ? `Scanned ${fmt.ago(scan.scannedAt)}` : undefined} action={
            <Button variant="ghost" size="sm" disabled={scanning} onClick={async () => {
              setScanning(true);
              await fetch(`/api/sites/${site.id}/scan`, { method: "POST" });
              await load(); setScanning(false);
            }}><Icon name="refresh" size={14} className={scanning ? "animate-spin" : ""} />{scanning ? "Scanning…" : "Scan again"}</Button>
          }>
            <div className="grid gap-3 md:grid-cols-3">
              <Fact icon="dns" label="DNS provider" value={provider?.name ?? "Not found"} ok={!!provider}
                sub={provider ? (provider.auto ? "We can add records for you" : "Records are added by hand (2 min)") : scan.error} />
              <Fact icon="server" label="Hosting" value={scan.host?.name ?? (scan.reachable ? "Not identified" : "Unknown")} ok={!!scan.host}
                sub={scan.cloudflareProxied ? "Traffic runs through Cloudflare's proxy" : scan.records?.a?.[0] ? `Points to ${scan.records.a[0]}` : undefined} />
              <Fact icon="code" label="Built with" value={scan.platform?.name ?? (scan.reachable ? "Custom" : "Couldn't load the site")} ok={!!scan.platform}
                sub={scan.reachable ? scan.finalUrl : scan.error} />
            </div>
            {provider?.nameservers?.length ? <p className="mt-3 text-[12px] text-muted">Nameservers: <span className="font-mono">{provider.nameservers.join(", ")}</span></p> : null}
          </Step>

          {/* 2 — install */}
          <Step n={2} done={installed} title="Add the tracker" action={<InstallStatus check={check} />}>
            <div className="space-y-6">
              {scan.cloudflareProxied && (info.signIn.cloudflare || site.dns.worker
                ? <CloudflareWorker site={site} spec={info.providerFields.cloudflare} onDone={load}
                    signInHref={info.signIn.cloudflare ? (intent: string) => connectHref("cloudflare", intent) : undefined} />
                : <Advanced className="" label="Advanced: install with zero code using a Cloudflare API token">
                    <CloudflareWorker site={site} spec={info.providerFields.cloudflare} onDone={load} />
                  </Advanced>)}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium">Your tag</span>
                  <CopyButton text={info.snippet} />
                </div>
                <Code>{info.snippet}</Code>
              </div>

              <div>
                <div className="mb-3 text-[13px] font-medium">Install guide</div>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {GUIDES.map(x => (
                    <button key={x.id} onClick={() => setGuide(x.id)}
                      className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${guide === x.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>
                      {x.name}{scan.platform?.id && guideFor(scan.platform.id) === x.id ? " · detected" : ""}
                    </button>
                  ))}
                </div>
                <ol className="space-y-2.5">
                  {g.steps(info.snippet, site.id, info.origin).map((s, i) => (
                    <li key={s} className="flex gap-3 text-[13px] leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-3 text-[11px] font-semibold">{i + 1}</span>{s}
                    </li>
                  ))}
                </ol>
                {g.code && <div className="mt-3"><Code>{g.code(info.snippet, site.id, info.origin)}</Code></div>}
                {g.id === "wordpress" && (
                  <a href={`/api/sites/${site.id}/wordpress`} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-on-accent shadow-card hover:bg-accent-hover"><Icon name="download" size={14} />Download WordPress plugin</a>
                )}
              </div>
            </div>
          </Step>

          {/* 3 — DNS */}
          <Step n={3} done={!!site.verified_at} title="Connect your domain" action={site.verified_at ? <Badge tone="good"><Icon name="check" size={12} />Verified</Badge> : <Badge>Optional · recommended</Badge>}>
            <p className="mb-4 text-[13px] leading-relaxed text-muted">
              Proves you own {site.domain}{info.cnameAvailable ? ` and serves the tracker from your own subdomain, so ad blockers don't drop your numbers` : ""}.
              {!info.cnameAvailable && " First-party tracking turns on once Pagewise is deployed with a CNAME_TARGET."}
            </p>
            {signIn && !site.verified_at && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent/25 bg-accent-soft/60 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold"><Icon name="bolt" size={14} className="text-accent" />Set it up by signing in to {signIn.name}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">You&apos;ll sign in at {signIn.name} and approve the records below. We never see your password, and nothing else is changed.</p>
                </div>
                <a href={connectHref(signIn.via, "dns")} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-[13.5px] font-medium text-on-accent shadow-card hover:bg-accent-hover">
                  Connect with {signIn.name}<Icon name="arrowRight" size={14} />
                </a>
              </div>
            )}
            <RecordsTable records={records} />
            {!signIn && (
              <p className="mt-4 text-[13px]">
                Add {records.length > 1 ? "these records" : "this record"} in {provider?.name ?? "your DNS provider"}&apos;s dashboard
                {info.providerLink && <> (<a className="font-medium text-accent hover:underline" href={info.providerLink} target="_blank" rel="noreferrer">open it</a>)</>}. We&apos;ll spot it automatically, usually within a few minutes.
              </p>
            )}
            {provider && spec && (
              <Advanced label="Advanced: set it up with an API token">
                <AutoDns site={site} provider={provider.id} spec={spec} onDone={() => { load(); runCheck(); }} />
              </Advanced>
            )}
            {!!site.dns.log?.length && (
              <div className="mt-5 space-y-1.5 border-t border-line pt-4">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Activity</div>
                {[...site.dns.log].reverse().slice(0, 8).map((l, i) => (
                  <div key={i} className="flex gap-2 text-[12.5px]">
                    <span className={l.ok ? "text-good" : "text-bad"}>{l.ok ? "✓" : "✗"}</span>
                    <span className="flex-1">{l.text}</span>
                    <span className="text-muted">{fmt.ago(l.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Step>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-8">
          <Card title="Setup progress" subtitle={`${doneCount} of ${steps.length} done`}>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="space-y-3">
              {steps.map(s => (
                <li key={s.label} className="flex items-center gap-3 text-[13px]">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${s.done ? "bg-good text-panel" : "border border-line-strong"}`}>
                    {s.done && <Icon name="check" size={12} strokeWidth={3} />}
                  </span>
                  <span className={s.done ? "text-muted" : "font-medium"}>{s.label}</span>
                  {s.optional && !s.done && <span className="text-[11.5px] text-faint">optional</span>}
                </li>
              ))}
            </ol>
          </Card>

          <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold"><Icon name="play" size={14} className="text-accent" />Just trying it out?</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">Our demo website already carries this site&apos;s tag. Click around, scroll, and watch the data arrive in your dashboard.</p>
            <a className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel text-[13px] font-medium shadow-card hover:bg-panel-2" href={`/demo/${site.id}`} target="_blank" rel="noreferrer">
              Open demo website<Icon name="external" size={14} />
            </a>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Step({ n, done, title, subtitle, action, children }: { n: number; done: boolean; title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card action={action} title={
      <span className="flex items-center gap-3">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${done ? "bg-good text-panel" : "bg-accent-soft text-accent"}`}>
          {done ? <Icon name="check" size={13} strokeWidth={3} /> : n}
        </span>
        <span>{title}{subtitle && <span className="ml-2 text-[12px] font-normal text-muted">{subtitle}</span>}</span>
      </span>
    }>{children}</Card>
  );
}

function Fact({ icon, label, value, sub, ok }: { icon: IconName; label: string; value: string; sub?: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/50 p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-faint">
        <Icon name={icon} size={14} />{label}
      </div>
      <div className={`mt-2 text-[15px] font-semibold tracking-tight ${ok ? "" : "text-muted"}`}>{value}</div>
      {sub && <div className="mt-1 truncate text-[12px] text-muted" title={sub}>{sub}</div>}
    </div>
  );
}

/** Collapsed by default: the API-token routes are for people who prefer them, not the main path. */
function Advanced({ label, children, className = "mt-4" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink">
        {label}<span className="inline-block transition group-open:rotate-90">›</span>
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function InstallStatus({ check }: { check: Check | null }) {
  if (!check) return <Badge>Checking…</Badge>;
  if (check.installed) return <Badge tone="good" dot>Receiving data · {fmt.n(check.visits)} visits{check.lastSeen ? ` · last ${fmt.ago(check.lastSeen)}` : ""}</Badge>;
  if (check.scriptOnHomepage) return <Badge tone="accent">Tag found, waiting for the first visit…</Badge>;
  return <Badge tone="warn">Waiting for the tag…</Badge>;
}

function RecordsTable({ records }: { records: Rec[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {records.map(r => (
        <div key={r.fqdn} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[11px] font-semibold">{r.type}</span>
              <span className="font-mono">{r.name}</span>
              <span className="text-muted">· {r.purpose}</span>
            </div>
            {r.live ? <Badge tone="good"><Icon name="check" size={12} />Live</Badge> : <Badge>Not found yet</Badge>}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-[12px]" title={r.value}>{r.value}</code>
            <CopyButton text={r.value} label="Copy" />
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
          onChange={e => set(f.key, e.target.value)} autoComplete="off" className={field} />
      ))}
    </div>
  );
}

function AutoDns({ site, provider, spec, onDone }: { site: SiteT; provider: string; spec: ProviderSpec; onDone: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="mt-4 rounded-lg border border-accent/25 bg-accent-soft/60 p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold"><Icon name="bolt" size={14} className="text-accent" />Set it up automatically with {spec.label}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{spec.help} <a className="font-medium text-accent hover:underline" href={spec.url} target="_blank" rel="noreferrer">Create one →</a> The token is used once and never stored.</p>
      <div className="mt-3"><CredFields spec={spec} values={creds} set={(k, v) => setCreds(c => ({ ...c, [k]: v }))} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={async () => {
          setBusy(true); setMsg("");
          const res = await fetch(`/api/sites/${site.id}/dns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "records", provider, creds }) });
          const d = await res.json().catch(() => ({}));
          setBusy(false); setCreds({});
          setMsg(res.ok ? (d.logs ?? []).every((l: { ok: boolean }) => l.ok) ? "Done. Records created; they usually go live within a minute." : "Some records couldn't be created; see the activity below." : d.error ?? "Failed");
          onDone();
        }}>{busy ? "Configuring…" : "Configure DNS for me"}</Button>
        {msg && <span className="text-[12.5px]">{msg}</span>}
      </div>
    </div>
  );
}

function CloudflareWorker({ site, spec, onDone, signInHref }: { site: SiteT; spec: ProviderSpec; onDone: () => void; signInHref?: (intent: string) => string }) {
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
  const tokenForm = (
    <>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">The token needs Workers Scripts → Edit, Workers Routes → Edit and Zone → Read. <a className="font-medium text-accent hover:underline" href={spec.url} target="_blank" rel="noreferrer">Create one →</a></p>
      <div className="mt-3"><CredFields spec={spec} values={creds} set={(k, v) => setCreds(c => ({ ...c, [k]: v }))} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!installed && <Button disabled={busy} onClick={() => go("worker")}>{busy ? "Installing…" : "Install automatically"}</Button>}
        {installed && <Button variant="danger" disabled={busy} onClick={() => go("worker_remove")}>{busy ? "Removing…" : "Remove Worker"}</Button>}
        {msg && <span className="text-[12.5px]">{msg}</span>}
      </div>
    </>
  );
  return (
    <div className="rounded-lg border border-accent/25 bg-accent-soft/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Icon name="bolt" size={14} className="text-accent" />Install with zero code: your site runs through Cloudflare</div>
        {installed && <Badge tone="good">Installed</Badge>}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        We deploy a tiny Cloudflare Worker that adds the tag to every HTML page as it&apos;s served. Your site&apos;s code isn&apos;t touched, and you can remove it any time.
      </p>
      {signInHref && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!installed
            ? <a href={signInHref("worker")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-on-accent shadow-card hover:bg-accent-hover">Sign in with Cloudflare to install<Icon name="arrowRight" size={14} /></a>
            : <a href={signInHref("worker_remove")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3.5 text-[13px] font-medium text-bad shadow-card hover:bg-bad-soft">Sign in with Cloudflare to remove</a>}
        </div>
      )}
      {signInHref ? <Advanced label="Advanced: install with an API token">{tokenForm}</Advanced> : tokenForm}
    </div>
  );
}
