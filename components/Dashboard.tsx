"use client";
// Site dashboard shell: range picker, tab routing, and the Overview + Sources tabs.
import Link from "next/link";
import { useState } from "react";
import AppShell, { type NavId } from "./AppShell";
import { AreaChart, type SeriesPoint } from "./Chart";
import { Icon } from "./icons";
import { Badge, BarList, Card, Delta, Empty, Loading, PageHeader, Stat, Tabs, fmt } from "./ui";
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

interface Kpis { visitors: number; visits: number; pageviews: number; pagesPerVisit: number; avgActiveMs: number; bounceRate: number | null; conversions: number; conversionRate: number | null }
interface OverviewData { range: { bucket: "hour" | "day" }; kpis: Kpis; previous: Kpis; series: SeriesPoint[]; live: number }
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!k || !p ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-19.5 animate-pulse rounded-xl border border-line bg-panel" />) : <>
          <Stat label="Conversion rate" value={fmt.pct(k.conversionRate)} delta={delta(k.conversionRate, p.conversionRate)} hint={`${k.conversions} converting visits`} />
          <Stat label="Pages per visit" value={k.pagesPerVisit} delta={delta(k.pagesPerVisit, p.pagesPerVisit)} />
          <Stat label="Avg. active time" value={fmt.ms(k.avgActiveMs)} delta={delta(k.avgActiveMs, p.avgActiveMs)} hint="Time the tab was actually visible" />
          <Stat label="Bounce rate" value={fmt.pct(k.bounceRate)} delta={delta(k.bounceRate, p.bounceRate)} invert hint="One page, no clicks, under 10 seconds" />
        </>}
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
