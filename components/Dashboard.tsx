"use client";
// Site dashboard shell: range picker, tab routing, and the Overview + Sources tabs.
import Link from "next/link";
import { useState } from "react";
import AppShell, { type NavId } from "./AppShell";
import { AreaChart, type SeriesPoint } from "./Chart";
import { Icon } from "./icons";
import { Badge, BarList, Card, Delta, Empty, Loading, PageHeader, Tabs, fmt } from "./ui";
import { useReport } from "./useReport";
import { PagesTab, SectionsTab, SettingsTab, VisitorsTab } from "./DashboardTabs";

export interface SiteProps {
  id: string; domain: string; installed_at: string | null;
  goals: { id: string; type: "app_link" | "click_text" | "path" | "event"; pattern: string; label: string }[];
  settings: { persistentIds?: boolean };
}
type Tab = "overview" | "sources" | "pages" | "sections" | "visitors" | "settings";
const TABS: Record<Tab, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Traffic, conversions and what to fix next." },
  sources: { title: "Sources", subtitle: "Where visitors come from, and which channels convert." },
  pages: { title: "Pages", subtitle: "How each page performs: time, scroll depth, clicks and flow." },
  sections: { title: "Sections", subtitle: "How far people read, and which sections turn readers into customers." },
  visitors: { title: "Visitors", subtitle: "Individual visits, replayed page by page and section by section." },
  settings: { title: "Goals & settings", subtitle: "What counts as a conversion, privacy, and the developer API." },
};
const RANGES = [{ id: "24h", label: "24h" }, { id: "7d", label: "7d" }, { id: "30d", label: "30d" }, { id: "90d", label: "90d" }];

export default function Dashboard({ email, site, initialTab }: { email: string; site: SiteProps; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab && initialTab in TABS ? (initialTab as Tab) : "overview");
  const [range, setRange] = useState("30d");
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `?tab=${t}`); window.scrollTo({ top: 0 }); };

  return (
    <AppShell email={email} site={site} active={tab} onNav={(id: NavId) => go(id as Tab)}>
      <PageHeader title={TABS[tab].title} subtitle={TABS[tab].subtitle} actions={tab !== "settings" && (
        <>
          <a href={`/demo/${site.id}`} target="_blank" rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition hover:bg-panel-2 hover:text-ink">
            <Icon name="external" size={14} />Demo site
          </a>
          <Tabs tabs={RANGES} value={range} onChange={setRange} />
        </>
      )} />
      {!site.installed_at && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-[13px]">
          <span><b>No data yet.</b> Add the tracker to {site.domain}, or open the demo site to see data arrive.</span>
          <div className="flex gap-2">
            <a className="inline-flex h-8 items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium hover:bg-panel-2" href={`/demo/${site.id}`} target="_blank" rel="noreferrer">Open demo site</a>
            <Link className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-medium text-on-accent hover:bg-accent-hover" href={`/sites/${site.id}/setup`}>Finish setup</Link>
          </div>
        </div>
      )}
      {tab === "overview" && <Overview siteId={site.id} range={range} go={go} />}
      {tab === "sources" && <Sources siteId={site.id} range={range} />}
      {tab === "pages" && <PagesTab siteId={site.id} range={range} />}
      {tab === "sections" && <SectionsTab siteId={site.id} range={range} />}
      {tab === "visitors" && <VisitorsTab siteId={site.id} range={range} />}
      {tab === "settings" && <SettingsTab site={site} />}
    </AppShell>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

interface Kpis {
  visitors: number; visits: number; pageviews: number; pagesPerVisit: number; avgActiveMs: number; bounceRate: number | null;
  conversions: number; conversionRate: number | null; engagedRate: number | null; clickRate: number | null; readThroughRate: number | null;
}
interface Side { visits: number; pages: number; activeMs: number; scroll: number; clickRate: number | null; topSource: string; topEntry: string; topDevice: string }
interface OverviewData { range: { bucket: "hour" | "day" }; kpis: Kpis; previous: Kpis; series: SeriesPoint[]; live: number; converters: { converted: Side | null; others: Side | null } }
interface InsightT { tone: "good" | "bad" | "info"; title: string; detail: string; tab?: Tab }
type Row = Record<string, unknown> & { key: string };
type Metric = "visitors" | "visits" | "pageviews" | "conversions";

const delta = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : Math.round(((a - b) / b) * 100));
const CHANNEL_LABEL: Record<string, string> = { direct: "Direct", organic: "Organic search", social: "Social", ai: "AI assistants", referral: "Referral", paid: "Paid", email: "Email", campaign: "Campaign", affiliate: "Affiliate" };

function Overview({ siteId, range, go }: { siteId: string; range: string; go: (t: Tab) => void }) {
  const { data, error } = useReport<OverviewData>(siteId, "overview", { range });
  const ins = useReport<{ insights: InsightT[] }>(siteId, "insights", { range });
  const src = useReport<{ sources: Row[]; channels: Row[] }>(siteId, "sources", { range });
  const pg = useReport<{ pages: (Record<string, unknown> & { path: string })[] }>(siteId, "pages", { range });
  const [metric, setMetric] = useState<Metric>("visitors");
  if (error) return <Card><Empty>{error}</Empty></Card>;
  const k = data?.kpis, p = data?.previous;
  const main: { id: Metric; label: string; value: string; d: number | null }[] = k && p ? [
    { id: "visitors", label: "Visitors", value: fmt.n(k.visitors), d: delta(k.visitors, p.visitors) },
    { id: "visits", label: "Visits", value: fmt.n(k.visits), d: delta(k.visits, p.visits) },
    { id: "pageviews", label: "Page views", value: fmt.n(k.pageviews), d: delta(k.pageviews, p.pageviews) },
    { id: "conversions", label: "Conversions", value: fmt.n(k.conversions), d: delta(k.conversions, p.conversions) },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-card xl:col-span-2">
          <div className="grid grid-cols-2 border-b border-line md:grid-cols-4">
            {!data ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-21 animate-pulse border-line bg-panel-2/50 md:border-r" />) : main.map((m, i) => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`relative px-5 py-4 text-left transition hover:bg-panel-2/60 ${i % 2 ? "" : "border-r"} border-line md:border-r ${i === 3 ? "md:border-r-0" : ""} ${i < 2 ? "border-b md:border-b-0" : ""}`}>
                <div className="text-[12px] font-medium text-muted">{m.label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="tabular text-[24px] font-semibold tracking-tight">{m.value}</span>
                  <Delta value={m.d} />
                </div>
                {metric === m.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
              </button>
            ))}
          </div>
          <div className="px-3 pb-3 pt-4">
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-[12px] text-muted">{main.find(m => m.id === metric)?.label ?? ""} over time</span>
              {!!data?.live && <Badge tone="good" dot>{data.live} live now</Badge>}
            </div>
            {data ? <AreaChart data={data.series} metric={metric} label={metric === "pageviews" ? "Views" : metric[0].toUpperCase() + metric.slice(1)} bucket={data.range.bucket} height={300} />
              : <div className="h-75 animate-pulse rounded-lg bg-panel-2/50" />}
          </div>
        </section>

        <Card title={<span className="flex items-center gap-2"><Icon name="sparkle" size={15} className="text-accent" />What to fix next</span>}
          subtitle="Generated from your data" flush className="flex flex-col">
          <div className="max-h-105 flex-1 overflow-y-auto">
            {!ins.data ? <div className="p-5"><Loading /></div> : !ins.data.insights.length ? <Empty>Nothing stands out yet. Check back once you have more visits.</Empty> : (
              <div className="divide-y divide-line">
                {ins.data.insights.map((i, n) => (
                  <button key={n} onClick={() => i.tab && go(i.tab)} className="group flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-panel-2/60">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${i.tone === "good" ? "bg-good-soft text-good" : i.tone === "bad" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent"}`}>
                      <Icon name={i.tone === "good" ? "up" : i.tone === "bad" ? "down" : "sparkle"} size={11} strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold leading-snug">{i.title}</div>
                      <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{i.detail}</div>
                    </div>
                    {i.tab && <Icon name="arrowRight" size={14} className="mt-0.5 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <QualityCard k={k} p={p} />
        <ConvertersCard data={data?.converters} go={go} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <Card title="Top sources" action={<LinkBtn onClick={() => go("sources")}>All sources</LinkBtn>}>
          {!src.data ? <Loading /> : <BarList rows={src.data.sources.slice(0, 8).map(r => ({ key: r.key, value: Number(r.visits), cells: [fmt.n(r.visits), fmt.rate(r.conversions, r.visits)] }))} columns={["Visits", "Conv."]} />}
        </Card>
        <Card title="Top pages" action={<LinkBtn onClick={() => go("pages")}>All pages</LinkBtn>}>
          {!pg.data ? <Loading /> : <BarList rows={pg.data.pages.slice(0, 8).map(r => ({ key: r.path, value: Number(r.views), cells: [fmt.n(r.views), fmt.ms(r.avg_time_ms)] }))} columns={["Views", "Time"]} />}
        </Card>
        <Card title="Channels" action={<LinkBtn onClick={() => go("sources")}>Details</LinkBtn>} className="lg:col-span-2 2xl:col-span-1">
          {!src.data ? <Loading /> : <BarList rows={src.data.channels.slice(0, 8).map(r => ({ key: CHANNEL_LABEL[r.key] ?? r.key, value: Number(r.visits), cells: [fmt.n(r.visits), fmt.rate(r.conversions, r.visits)] }))} columns={["Visits", "Conv."]} />}
        </Card>
      </div>
    </div>
  );
}

// ── Visitor quality: each number with what it means and whether it's good ──

interface QualityRow { key: keyof Kpis; label: string; explain: string; typical: string; good: number; ok: number; lowerIsBetter?: boolean; show: (v: number) => string }
// Rough rules of thumb for small business and SaaS marketing sites.
const QUALITY: QualityRow[] = [
  { key: "conversionRate", label: "Conversion rate", explain: "Visits that reached one of your goals.", typical: "Typical: 1–3%", good: 3, ok: 1, show: v => `${v}%` },
  { key: "engagedRate", label: "Engaged visits", explain: "Stayed 30s+, viewed 2+ pages, or converted.", typical: "Typical: 40–60%", good: 60, ok: 40, show: v => `${v}%` },
  { key: "bounceRate", label: "Bounce rate", explain: "Left after one page with no clicks, in under 10s.", typical: "Typical: 40–60%", good: 40, ok: 60, lowerIsBetter: true, show: v => `${v}%` },
  { key: "readThroughRate", label: "Read to the end", explain: "Page views scrolled at least 75% of the way down.", typical: "Typical: 20–40%", good: 40, ok: 20, show: v => `${v}%` },
  { key: "clickRate", label: "Clicked something", explain: "Visits with at least one click on a link or button.", typical: "Typical: 20–40%", good: 40, ok: 20, show: v => `${v}%` },
  { key: "pagesPerVisit", label: "Pages per visit", explain: "How far people explore past the first page.", typical: "Typical: 1.5–3", good: 3, ok: 1.5, show: v => String(v) },
  { key: "avgActiveMs", label: "Active time per visit", explain: "Time the tab was visible; idle tabs don't count.", typical: "Typical: 30s–2m", good: 120_000, ok: 30_000, show: v => fmt.ms(v) },
];

function verdict(row: QualityRow, v: number): { tone: "good" | "neutral" | "bad"; label: string } {
  if (row.lowerIsBetter) return v <= row.good ? { tone: "good", label: "Strong" } : v <= row.ok ? { tone: "neutral", label: "Typical" } : { tone: "bad", label: "High" };
  return v >= row.good ? { tone: "good", label: "Strong" } : v >= row.ok ? { tone: "neutral", label: "Typical" } : { tone: "bad", label: "Low" };
}

function QualityCard({ k, p }: { k?: Kpis; p?: Kpis }) {
  const early = !!k && k.visits < 30;
  return (
    <Card title="Visitor quality" subtitle="What each number means, and how it compares with typical websites" flush>
      {!k || !p ? <div className="p-5"><Loading rows={6} /></div> : (
        <div className="divide-y divide-line">
          {QUALITY.map(row => {
            const v = k[row.key] as number | null;
            const prev = p[row.key] as number | null;
            const vd = v === null ? null : verdict(row, v);
            return (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_88px_64px_84px]">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{row.label}</div>
                  <div className="text-[12px] leading-snug text-muted">{row.explain}</div>
                  <div className="mt-0.5 text-[11.5px] text-faint">{row.typical}</div>
                </div>
                <div className="tabular text-right text-[15px] font-semibold">{v === null ? "—" : row.show(v)}</div>
                <div className="hidden justify-end sm:flex"><Delta value={delta(v, prev)} invert={row.lowerIsBetter} /></div>
                <div className="hidden justify-end sm:flex">
                  {vd && <Badge tone={vd.tone === "neutral" ? "neutral" : vd.tone}>{vd.label}</Badge>}
                </div>
              </div>
            );
          })}
          {early && <p className="px-5 py-3 text-[12px] text-muted">Based on {k.visits} visit{k.visits === 1 ? "" : "s"}. Verdicts settle down after about 30 visits.</p>}
        </div>
      )}
    </Card>
  );
}

// ── What converters do differently ──────────────────────────────────────────

function ConvertersCard({ data, go }: { data?: { converted: Side | null; others: Side | null }; go: (t: Tab) => void }) {
  const c = data?.converted, o = data?.others;
  const times = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10) / 10 : null);
  const pagesX = c && o ? times(c.pages, o.pages) : null;
  const timeX = c && o ? times(c.activeMs, o.activeMs) : null;
  const rows: { label: string; a: string; b: string; win?: boolean }[] = c && o ? [
    { label: "Visits", a: fmt.n(c.visits), b: fmt.n(o.visits) },
    { label: "Pages per visit", a: String(c.pages), b: String(o.pages), win: c.pages > o.pages },
    { label: "Active time", a: fmt.ms(c.activeMs), b: fmt.ms(o.activeMs), win: c.activeMs > o.activeMs },
    { label: "Avg. scroll depth", a: `${c.scroll}%`, b: `${o.scroll}%`, win: c.scroll > o.scroll },
    { label: "Clicked something", a: fmt.pct(c.clickRate), b: fmt.pct(o.clickRate), win: (c.clickRate ?? 0) > (o.clickRate ?? 0) },
    { label: "Most common source", a: c.topSource, b: o.topSource },
    { label: "Most common landing page", a: c.topEntry, b: o.topEntry },
    { label: "Most common device", a: c.topDevice, b: o.topDevice },
  ] : [];
  return (
    <Card title={<span className="flex items-center gap-2"><Icon name="target" size={15} className="text-accent" />What converters do differently</span>}
      subtitle="Visits that reached a goal, compared with the rest" flush>
      {!data ? <div className="p-5"><Loading rows={6} /></div> : !c ? (
        <Empty>
          <span>No conversions in this period yet. Check that your goals match how people sign up or buy in{" "}
            <button className="font-medium text-accent hover:underline" onClick={() => go("settings")}>Goals &amp; settings</button>.</span>
        </Empty>
      ) : !o ? <Empty>Every visit in this period converted, so there&apos;s nothing to compare yet.</Empty> : (
        <>
          {(pagesX !== null || timeX !== null) && (
            <div className="border-b border-line bg-accent-soft/40 px-5 py-3.5 text-[13px] leading-relaxed">
              People who convert view <b>{pagesX ?? "—"}×</b> as many pages and spend <b>{timeX ?? "—"}×</b> as long on your site.
              {c.topEntry !== o.topEntry && <> They most often arrive on <b className="font-mono text-[12px]">{c.topEntry}</b>.</>}
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-faint">
            <span /><span className="text-right">Converted</span><span className="text-right">Didn&apos;t</span>
          </div>
          <div className="divide-y divide-line">
            {rows.map(r => (
              <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-4 px-5 py-2.5 text-[13px]">
                <span className="text-muted">{r.label}</span>
                <span className={`tabular truncate text-right ${r.win ? "font-semibold text-good" : "font-medium"}`} title={r.a}>{r.a}</span>
                <span className="tabular truncate text-right text-muted" title={r.b}>{r.b}</span>
              </div>
            ))}
          </div>
          <p className="px-5 py-3 text-[11.5px] text-faint">Converted visits include the pages people see after converting, such as a thank-you page.</p>
        </>
      )}
    </Card>
  );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="group inline-flex items-center gap-1 text-[12.5px] font-medium text-muted transition hover:text-ink">
      {children}<Icon name="arrowRight" size={13} className="transition group-hover:translate-x-0.5" />
    </button>
  );
}

// ── Sources ─────────────────────────────────────────────────────────────────

function Sources({ siteId, range }: { siteId: string; range: string }) {
  const { data, error } = useReport<Record<string, Row[]>>(siteId, "sources", { range });
  if (error) return <Card><Empty>{error}</Empty></Card>;
  const conv = (rows: Row[], label?: (k: string) => string) => rows.map(r => ({
    key: label ? label(r.key) : r.key, value: Number(r.visits),
    cells: [fmt.n(r.visits), fmt.rate(r.bounces, r.visits), fmt.rate(r.conversions, r.visits)],
  }));
  const simple = (rows: Row[]) => rows.map(r => ({ key: r.key, value: Number(r.visits), cells: [fmt.n(r.visits), fmt.rate(r.conversions, r.visits)] }));
  const cards: [string, (d: Record<string, Row[]>) => React.ReactNode][] = [
    ["Channels", d => <BarList rows={conv(d.channels, x => CHANNEL_LABEL[x] ?? x)} columns={["Visits", "Bounce", "Conv."]} />],
    ["Sources", d => <BarList rows={conv(d.sources)} columns={["Visits", "Bounce", "Conv."]} />],
    ["Campaigns (UTM)", d => <BarList rows={conv(d.campaigns)} columns={["Visits", "Bounce", "Conv."]} empty="No tagged campaigns yet. Add ?utm_campaign=… to your links." />],
    ["Landing pages", d => <BarList rows={conv(d.landing)} columns={["Visits", "Bounce", "Conv."]} />],
    ["Devices", d => <BarList rows={simple(d.devices)} columns={["Visits", "Conv."]} />],
    ["Countries", d => <BarList rows={simple(d.countries)} columns={["Visits", "Conv."]} empty="Country appears once deployed on Vercel or behind Cloudflare." />],
    ["Browsers", d => <BarList rows={simple(d.browsers)} columns={["Visits", "Conv."]} />],
    ["Operating systems", d => <BarList rows={simple(d.oses)} columns={["Visits", "Conv."]} />],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
      {cards.map(([title, body]) => <Card key={title} title={title}>{data ? body(data) : <Loading />}</Card>)}
    </div>
  );
}
