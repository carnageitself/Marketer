"use client";
// Pages, Sections, Visitors (with visit replay) and Settings tabs.
import { useState } from "react";
import { Badge, BarList, Button, Card, Empty, Loading, Table, Upsell, field, fmt } from "./ui";
import { Icon } from "./icons";
import { CURRENCIES, money } from "@/lib/currency";
import { useReport } from "./useReport";
import type { SiteProps } from "./Dashboard";

type R = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// ── Pages ───────────────────────────────────────────────────────────────────

export function PagesTab({ siteId, range }: { siteId: string; range: string }) {
  const { data, error } = useReport<{ pages: R[]; links: R[]; flow: R[] }>(siteId, "pages", { range });
  const [path, setPath] = useState<string | null>(null);
  if (error) return <Card><Empty>{error}</Empty></Card>;
  if (!data) return <Card><Loading rows={6} /></Card>;
  return (
    <div className="space-y-6">
      <Card title="Pages" action={<span className="hidden text-[12px] text-muted sm:inline">Click a page for scroll depth, clicks and flow</span>}>
        <Table head={["Page", "Views", "Visitors", "Avg. time", "Scroll", "Entrances", "Exits"]}
          rows={data.pages.map(p => [
            <button key="p" className="text-left text-accent hover:underline" onClick={() => setPath(s(p.path))}>{s(p.path)}</button>,
            fmt.n(p.views), fmt.n(p.visitors), fmt.ms(p.avg_time_ms), `${Math.round(Number(p.avg_scroll))}%`, fmt.n(p.entrances), fmt.n(p.exits),
          ])} />
      </Card>
      {path && <PageDetail siteId={siteId} range={range} path={path} onClose={() => setPath(null)} />}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="What people click">
          <Table head={["Link / button", "Page", "Clicks"]} rows={data.links.map(l => [
            <span key="l" title={s(l.href)}>{s(l.label) || s(l.href) || "(no label)"} <span className="text-muted">· {s(l.kind)}</span></span>,
            s(l.path), fmt.n(l.clicks),
          ])} />
        </Card>
        <Card title="Page to page">
          <Table head={["From → to", "Navigations"]} rows={data.flow.map(f => [`${s(f.from)} → ${s(f.to)}`, fmt.n(f.navigations)])} empty="Needs visits with 2+ pages." />
        </Card>
      </div>
    </div>
  );
}

function PageDetail({ siteId, range, path, onClose }: { siteId: string; range: string; path: string; onClose: () => void }) {
  const { data } = useReport<{ views: number; medianTimeMs: number; scroll: { depth: number; pct: number | null }[]; clicks: R[]; cameFrom: R[]; wentTo: R[] }>(siteId, "page", { range, path });
  return (
    <Card title={<>Page: <span className="font-mono">{path}</span></>} action={<Button variant="subtle" size="sm" onClick={onClose}><Icon name="close" size={14} />Close</Button>}>
      {!data ? <Loading /> : (
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">SCROLL DEPTH · median time {fmt.ms(data.medianTimeMs)}</div>
            {data.scroll.map(x => (
              <div key={x.depth} className="mb-2">
                <div className="flex justify-between text-[12px]"><span>Reached {x.depth}%</span><span className="tabular">{fmt.pct(x.pct)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-2 rounded-full bg-accent" style={{ width: `${x.pct ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">CAME FROM</div>
            <BarList rows={data.cameFrom.map(r => ({ key: s(r.path), value: Number(r.n) }))} />
            <div className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wider text-faint">WENT TO</div>
            <BarList rows={data.wentTo.map(r => ({ key: s(r.path), value: Number(r.n) }))} empty="Nobody went further" />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">CLICKS ON THIS PAGE</div>
            <BarList rows={data.clicks.map(c => ({ key: s(c.label) || s(c.href) || "(no label)", value: Number(c.clicks), cells: [fmt.n(c.clicks), fmt.pct(c.ctr as number)] }))} columns={["Clicks", "CTR"]} empty="No clicks yet" />
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

interface Sec {
  id: string; name: string; index: number; seen: number; reach: number | null; avgDwellMs: number; medianDwellMs: number;
  engagedRate: number | null; avgVisible: number; clicks: number; readers: number; readerConvRate: number | null;
  nonReaders: number; nonReaderConvRate: number | null; lift: number | null;
  readerRevPerVisit: number | null; nonReaderRevPerVisit: number | null;
}

export function SectionsTab({ siteId, range }: { siteId: string; range: string }) {
  const pages = useReport<{ pages: R[] }>(siteId, "section_pages", { range });
  const [picked, setPath] = useState<string | null>(null);
  const list = pages.data?.pages ?? [];
  const path = picked ?? (list[0] ? s(list[0].path) : null);
  const secs = useReport<{ sections: Sec[]; revenueLocked: boolean; currency: string }>(siteId, "sections", { range, path: path ?? undefined }, !!path);
  if (pages.error) return <Card><Empty>{pages.error}</Empty></Card>;
  if (!pages.data) return <Card><Loading rows={6} /></Card>;
  if (!list.length) return <Empty>No section data yet. Sections are detected automatically on every page; they appear after the first visits.</Empty>;
  const rows = secs.data?.sections ?? [];
  const maxDwell = Math.max(...rows.map(r => r.avgDwellMs), 1);
  const cur = secs.data?.currency ?? "USD";
  const showRev = rows.some(r => (r.readerRevPerVisit ?? 0) > 0 || (r.nonReaderRevPerVisit ?? 0) > 0);
  const cols = showRev ? "md:grid-cols-[minmax(0,1fr)_100px_80px_64px_170px_150px]" : "md:grid-cols-[minmax(0,1fr)_110px_110px_90px_190px]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-muted">Page</span>
        <select value={path ?? ""} onChange={e => setPath(e.target.value)} className={`${field} min-w-72`}>
          {list.map(p => <option key={s(p.path)} value={s(p.path)}>{s(p.path)} · {fmt.n(p.views)} views</option>)}
        </select>
      </div>
      <Card title="Reading funnel" subtitle="How far down the page people get, and what each section is worth"
        action={<span className="hidden text-[12px] text-muted sm:inline">Top to bottom in page order</span>}>
        {!secs.data ? <Loading rows={6} /> : !rows.length ? <Empty>No sections seen on this page yet.</Empty> : (
          <div className="space-y-1">
            <div className={`hidden gap-3 px-1 pb-1 text-[11px] uppercase tracking-wide text-muted md:grid ${cols}`}>
              <span>Section · reach</span><span className="text-right">Avg. read</span><span className="text-right">Engaged</span><span className="text-right">Clicks</span><span className="text-right">Readers convert</span>
              {showRev && <span className="text-right">Readers spend</span>}
            </div>
            {rows.map(r => (
              <div key={r.id} className={`grid grid-cols-2 items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-panel-2 ${cols}`}>
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium" title={r.id}>{r.name}</span>
                    <span className="tabular text-muted">{fmt.pct(r.reach)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, r.reach ?? 0)}%` }} /></div>
                </div>
                <div className="text-right text-[13px]">
                  <span className="text-muted md:hidden">Avg. read </span><span className="tabular">{fmt.ms(r.avgDwellMs)}</span>
                  <div className="ml-auto mt-1 h-1 w-full rounded bg-panel-2"><div className="ml-auto h-1 rounded bg-good" style={{ width: `${(r.avgDwellMs / maxDwell) * 100}%` }} /></div>
                </div>
                <div className="tabular text-right text-[13px]"><span className="text-muted md:hidden">Engaged </span>{fmt.pct(r.engagedRate)}</div>
                <div className="tabular text-right text-[13px]"><span className="text-muted md:hidden">Clicks </span>{fmt.n(r.clicks)}</div>
                <div className="text-right text-[13px]">
                  <span className="text-muted md:hidden">Readers convert </span>
                  {r.readerConvRate === null ? <span className="text-muted">—</span> : (
                    <span title={`${r.readers} visits read it (1s+), ${r.nonReaders} didn't. Converted: ${r.readerConvRate}% vs ${r.nonReaderConvRate ?? "—"}%`}>
                      <span className="tabular">{r.readerConvRate}%</span>
                      <span className="text-muted"> vs {r.nonReaderConvRate ?? "—"}%</span>{" "}
                      {r.lift !== null && r.lift !== 1 && <Badge tone={r.lift > 1 ? "good" : "bad"}>{r.lift}×</Badge>}
                    </span>
                  )}
                </div>
                {showRev && (
                  <div className="text-right text-[13px]" title="Revenue per visit: visitors who read this section vs those who didn't (before refunds)">
                    <span className="text-muted md:hidden">Readers spend </span>
                    {r.readerRevPerVisit === null ? <span className="text-muted">—</span> : <>
                      <span className={`tabular ${(r.readerRevPerVisit ?? 0) > (r.nonReaderRevPerVisit ?? 0) ? "font-semibold text-good" : ""}`}>{money(r.readerRevPerVisit, cur)}</span>
                      <span className="text-muted"> vs {money(r.nonReaderRevPerVisit, cur)}</span>
                    </>}
                  </div>
                )}
              </div>
            ))}
            <p className="pt-3 text-[12px] text-muted">
              <b>Reach</b>: share of page views where the section was on screen. <b>Engaged</b>: stayed 3s+. <b>Readers convert</b>: conversion rate of visits that read the section (1s+)
              vs visits to this page that didn&apos;t. A high multiplier on a low-reach section usually means it should move up.
              {showRev && <> <b>Readers spend</b>: revenue per visit for readers vs everyone else, before refunds. It shows association, not proof the section caused the sale.</>}
            </p>
            {secs.data?.revenueLocked && (
              <a href="/billing" className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"><Icon name="sparkle" size={13} className="text-accent" />See how much revenue each section brings in on Pro →</a>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Visitors & visit replay ─────────────────────────────────────────────────

export function VisitorsTab({ siteId, range }: { siteId: string; range: string }) {
  const { data, error } = useReport<{ visits: R[] }>(siteId, "visitors", { range });
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <Card><Empty>{error}</Empty></Card>;
  if (!data) return <Card><Loading rows={6} /></Card>;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Card title={`Recent visits (${data.visits.length})`}>
        {!data.visits.length ? <Empty>No visits in this period.</Empty> : (
          <div className="max-h-[75vh] divide-y divide-line overflow-y-auto">
            {data.visits.map(v => (
              <button key={s(v.id)} onClick={() => setOpen(s(v.id))} className={`flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-panel-2 ${open === v.id ? "bg-panel-2" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="font-medium">{s(v.source)}</span>
                    {v.converted ? <Badge tone="good">Converted</Badge> : null}
                    {v.bounce ? <Badge>Bounced</Badge> : null}
                    {Number(v.visit_number) > 1 && <Badge tone="accent">Visit #{s(v.visit_number)}</Badge>}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {s(v.entry_path)}{v.exit_path && v.exit_path !== v.entry_path ? ` → … → ${s(v.exit_path)}` : ""} · {s(v.device)} · {s(v.browser)}{v.country ? ` · ${s(v.country)}` : ""}
                    {v.top_section ? ` · spent most time on “${s(v.top_section)}”` : ""}
                  </div>
                </div>
                <div className="text-right text-[12px]">
                  <div className="tabular">{s(v.page_count)} {Number(v.page_count) === 1 ? "page" : "pages"} · {fmt.ms(v.active_ms)}</div>
                  <div className="text-muted">{fmt.ago(v.started_at)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
      <div className="min-w-0 xl:sticky xl:top-8 xl:self-start">
        {open ? <Journey siteId={siteId} visitId={open} onOpen={setOpen} /> : <Card title="Visit replay"><Empty>Pick a visit to see every page, section and click in order.</Empty></Card>}
      </div>
    </div>
  );
}

interface JourneyT {
  visit: R;
  pages: (R & { sections: R[]; clicks: R[] })[];
  events: R[];
  otherVisits: R[];
}

function Journey({ siteId, visitId, onOpen }: { siteId: string; visitId: string; onOpen: (id: string) => void }) {
  const { data, error, upgrade } = useReport<JourneyT>(siteId, "journey", { visit: visitId });
  if (upgrade) return <Card title="Visit replay"><Upsell title="Replay any visit">Follow one visitor page by page and section by section, with every click in order. No screen recording, no cookies.</Upsell></Card>;
  if (error) return <Card title="Visit replay"><Empty>{error}</Empty></Card>;
  if (!data) return <Card title="Visit replay"><Loading rows={6} /></Card>;
  const v = data.visit;
  return (
    <Card title="Visit replay" action={v.converted ? <Badge tone="good">Converted</Badge> : <Badge>No conversion</Badge>}>
      <div className="text-[12px] text-muted">
        {new Date(s(v.started_at)).toLocaleString()} · {s(v.source_name) || "Direct"} ({s(v.channel)}){v.utm_campaign ? ` · campaign “${s(v.utm_campaign)}”` : ""}
        <br />{s(v.device)} · {s(v.browser)} · {s(v.os)}{v.country ? ` · ${s(v.country)}` : ""}{v.screen_w ? ` · ${s(v.screen_w)}px screen` : ""} · {v.persistent ? "returning-visitor ID" : "anonymous (no cookies)"}
      </div>
      <ol className="mt-4 space-y-4 border-l border-line pl-4">
        {data.pages.map((p, i) => (
          <li key={s(p.id)} className="relative">
            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-accent" />
            <div className="text-[13px] font-medium">{i + 1}. {s(p.path)}</div>
            <div className="text-[12px] text-muted">{s(p.title)} · {fmt.ms(p.time_ms)} active · scrolled {s(p.max_scroll ?? 0)}%</div>
            {!!p.sections.length && (
              <div className="mt-2 space-y-1">
                {p.sections.map(x => (
                  <div key={s(x.section_id)} className="flex items-center gap-2 text-[12px]">
                    <span className="w-32 truncate" title={s(x.section_name)}>{s(x.section_name)}</span>
                    <div className="h-1.5 flex-1 rounded bg-panel-2"><div className="h-1.5 rounded bg-good" style={{ width: `${Math.min(100, (Number(x.dwell_ms) / 20000) * 100)}%` }} /></div>
                    <span className="tabular w-12 text-right text-muted">{fmt.ms(x.dwell_ms)}</span>
                  </div>
                ))}
              </div>
            )}
            {p.clicks.map((c, j) => (
              <div key={j} className="mt-1 text-[12px]">👆 Clicked <b>{s(c.label) || s(c.href) || "(no label)"}</b> <span className="text-muted">({s(c.kind)}{c.section_id ? ` in “${s(p.sections.find(x => x.section_id === c.section_id)?.section_name ?? c.section_id)}”` : ""})</span></div>
            ))}
          </li>
        ))}
      </ol>
      {!!data.events.length && (
        <div className="mt-4 text-[12px]">
          <div className="mb-1 font-medium text-muted">CUSTOM EVENTS</div>
          {data.events.map((e, i) => <div key={i}>⚡ {s(e.name)} <span className="text-muted">on {s(e.path)}</span></div>)}
        </div>
      )}
      {!!data.otherVisits.length && (
        <div className="mt-4 border-t border-line pt-3 text-[12px]">
          <div className="mb-1 font-medium text-muted">OTHER VISITS BY THIS VISITOR</div>
          {data.otherVisits.map(o => (
            <button key={s(o.id)} className="block text-accent hover:underline" onClick={() => onOpen(s(o.id))}>
              {new Date(s(o.started_at)).toLocaleString()} · {s(o.page_count)} pages from {s(o.entry_path)}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

const GOAL_TYPES = [
  { id: "app_link", label: "Went to the app", hint: "Click to a link on another subdomain, e.g. app.yoursite.com" },
  { id: "click_text", label: "Clicked a link/button matching", hint: "Text or URL, e.g. sign up|get started" },
  { id: "path", label: "Visited a page matching", hint: "e.g. /thank-you|/welcome" },
  { id: "event", label: "Custom event named", hint: "From pagewise('track', 'Signed up')" },
] as const;

export function SettingsTab({ site, role }: { site: SiteProps; role: string }) {
  const canEdit = role !== "viewer";
  const canDelete = role === "owner" || role === "admin";
  const [goals, setGoals] = useState(site.goals);
  const [persistent, setPersistent] = useState(!!site.settings.persistentIds);
  const [currency, setCurrency] = useState(site.currency || "USD");
  const [msg, setMsg] = useState("");
  const save = async (body: object) => {
    setMsg("");
    const res = await fetch(`/api/sites/${site.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved ✓" : d.error ?? "Failed");
  };
  return (
    <>
    {!canEdit && <ReadOnly />}
    <fieldset disabled={!canEdit} className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card title="Conversion goals" subtitle="A visit counts as converted when it matches any goal. Patterns are case-insensitive regular expressions."
        action={msg && <Badge tone={msg.startsWith("Saved") ? "good" : "bad"}>{msg}</Badge>}>
        <div className="space-y-2.5">
          {goals.map((g, i) => (
            <div key={g.id} className="space-y-2 rounded-lg border border-line bg-panel-2/40 p-3">
              {/* Line 1: what counts as this conversion */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Icon name="target" size={16} className="hidden text-faint md:block" />
                <select value={g.type} aria-label="Goal type" className={`${field} md:w-64 md:shrink-0`} onChange={e => setGoals(goals.map((x, j) => j === i ? { ...x, type: e.target.value as typeof g.type } : x))}>
                  {GOAL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {g.type !== "app_link"
                  ? <input value={g.pattern} aria-label="Pattern" placeholder={GOAL_TYPES.find(t => t.id === g.type)?.hint} className={`${field} min-w-0 flex-1 font-mono`}
                      onChange={e => setGoals(goals.map((x, j) => j === i ? { ...x, pattern: e.target.value } : x))} />
                  : <span className="flex-1 text-[12.5px] text-muted">Any click to another subdomain of your site, e.g. app.{"{"}your domain{"}"}</span>}
              </div>
              {/* Line 2: its name and what it's worth */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:pl-6">
                <input value={g.label} aria-label="Goal name" placeholder="Name, e.g. Booked a demo" className={`${field} min-w-0 flex-1`}
                  onChange={e => setGoals(goals.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <label className="relative md:w-40 md:shrink-0" title="What one conversion is worth to you. Used for revenue when the page doesn't report a purchase amount.">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-faint">{currency}</span>
                  <input type="number" min={0} step="any" value={g.value ?? ""} placeholder="Worth" aria-label="Worth" className={`${field} tabular w-full pl-11`}
                    onChange={e => setGoals(goals.map((x, j) => j === i ? { ...x, value: e.target.value === "" ? undefined : Number(e.target.value) } : x))} />
                </label>
                <button title="Remove goal" className="self-end rounded-md p-2 text-muted transition hover:bg-bad-soft hover:text-bad md:self-auto" onClick={() => setGoals(goals.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button>
              </div>
            </div>
          ))}
          {!goals.length && <Empty>No goals. Without one, nothing counts as a conversion.</Empty>}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          <b className="text-ink">Worth</b> is optional: what one conversion is worth to you, e.g. a demo request worth {currency} 500. It counts as revenue when the page
          doesn&apos;t report the real amount. Purchases from Shopify, WooCommerce or Google Analytics ecommerce are picked up automatically and take priority.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={() => setGoals([...goals, { id: `g_${Date.now()}`, type: "click_text", pattern: "", label: "" }])}><Icon name="plus" size={14} />Add goal</Button>
          <Button onClick={() => save({ goals })}>Save goals</Button>
        </div>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card title={<span className="flex items-center gap-2"><Icon name="target" size={15} className="text-accent" />Revenue</span>}>
          <label className="block text-[13px]">
            <span className="font-semibold">Reporting currency</span>
            <span className="mt-0.5 block text-muted">Revenue in other currencies is converted at the European Central Bank&apos;s daily rate, so totals add up.</span>
            <select value={currency} className={`${field} mt-2.5 w-full`} onChange={e => { setCurrency(e.target.value); save({ currency: e.target.value }); }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Icon name="shield" size={15} className="text-accent" />Privacy</span>}>
          <label className="flex cursor-pointer items-start gap-3 text-[13px]">
            <input type="checkbox" checked={persistent} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" onChange={e => { setPersistent(e.target.checked); save({ settings: { persistentIds: e.target.checked } }); }} />
            <span>
              <b>Recognise returning visitors</b>
              <span className="mt-1 block leading-relaxed text-muted">Stores a random ID in the visitor&apos;s browser. Off by default: visitors are counted with a hash that rotates daily, so no cookie banner is needed. Turn this on only if your site asks for consent,
                then add <code className="font-mono text-ink">data-persistent=&quot;true&quot;</code> to the tag, or call <code className="font-mono text-ink">pagewise(&apos;consent&apos;, true)</code> after the visitor accepts.</span>
            </span>
          </label>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Icon name="code" size={15} className="text-accent" />Developer API</span>}>
          <div className="space-y-2.5 text-[13px]">
            <p className="text-muted">Track anything the automatic listeners can&apos;t see:</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-panel-2 p-3 font-mono text-[12px]">{`pagewise('track', 'Signed up', { plan: 'pro' })`}</pre>
            <p className="text-muted">Name your sections (optional; they&apos;re detected automatically):</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-panel-2 p-3 font-mono text-[12px]">{`<section data-section="pricing"
  data-section-name="Pricing">…</section>`}</pre>
          </div>
        </Card>

        {canDelete && <Card title="Danger zone" className="border-bad/25">
          <p className="mb-3 text-[13px] text-muted">Deletes {site.domain} and every visit, page view and click recorded for it.</p>
          <Button variant="danger" onClick={async () => {
            if (!confirm(`Delete ${site.domain} and all of its data? This can't be undone.`)) return;
            const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
            if (res.ok) window.location.href = "/sites";
          }}><Icon name="trash" size={14} />Delete website</Button>
        </Card>}
      </div>
    </fieldset>
    </>
  );
}

export function ReadOnly() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-[13px] text-muted">
      <Icon name="shield" size={16} className="text-faint" />You have view-only access to this website. Ask the workspace owner for editor access to make changes.
    </div>
  );
}
