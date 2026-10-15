"use client";
// Site dashboard shell: range picker, tabs, and the Overview + Sources tabs.
import Link from "next/link";
import { useState } from "react";
import TopBar from "./TopBar";
import { AreaChart, type SeriesPoint } from "./Chart";
import { Badge, BarList, Card, Empty, Stat, Tabs, fmt } from "./ui";
import { useReport } from "./useReport";
import { PagesTab, SectionsTab, SettingsTab, VisitorsTab } from "./DashboardTabs";

export interface SiteProps {
  id: string; domain: string; installed_at: string | null;
  goals: { id: string; type: "app_link" | "click_text" | "path" | "event"; pattern: string; label: string }[];
  settings: { persistentIds?: boolean };
}
type Tab = "overview" | "sources" | "pages" | "sections" | "visitors" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "sources", label: "Sources" }, { id: "pages", label: "Pages" },
  { id: "sections", label: "Sections" }, { id: "visitors", label: "Visitors" }, { id: "settings", label: "Settings" },
];
const RANGES = [{ id: "24h", label: "24 hours" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }, { id: "90d", label: "90 days" }];

export default function Dashboard({ email, site, initialTab }: { email: string; site: SiteProps; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(TABS.some(x => x.id === initialTab) ? (initialTab as Tab) : "overview");
  const [range, setRange] = useState("30d");
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `?tab=${t}`); };

  return (
    <>
      <TopBar email={email}>
        <span className="truncate text-[13px] text-muted">/ {site.domain}</span>
        <Link href={`/sites/${site.id}/setup`} className="ml-2 text-[12px] text-accent">Setup</Link>
      </TopBar>
      <main className="mx-auto max-w-6xl px-4 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Tabs tabs={TABS} value={tab} onChange={go} />
          {tab !== "settings" && (
            <select value={range} onChange={e => setRange(e.target.value)} className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px]">
              {RANGES.map(r => <option key={r.id} value={r.id}>Last {r.label}</option>)}
            </select>
          )}
        </div>
        {!site.installed_at && (
          <div className="mb-4 rounded-xl border border-line bg-bad-soft px-4 py-3 text-[13px]">
            No data yet. <Link className="font-medium text-accent" href={`/sites/${site.id}/setup`}>Finish setup</Link> or try the{" "}
            <a className="font-medium text-accent" href={`/demo/${site.id}`} target="_blank" rel="noreferrer">demo site</a>.
          </div>
        )}
        {tab === "overview" && <Overview siteId={site.id} range={range} go={go} />}
        {tab === "sources" && <Sources siteId={site.id} range={range} />}
        {tab === "pages" && <PagesTab siteId={site.id} range={range} />}
        {tab === "sections" && <SectionsTab siteId={site.id} range={range} />}
        {tab === "visitors" && <VisitorsTab siteId={site.id} range={range} />}
        {tab === "settings" && <SettingsTab site={site} />}
      </main>
    </>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

interface Kpis { visitors: number; visits: number; pageviews: number; pagesPerVisit: number; avgActiveMs: number; bounceRate: number | null; conversions: number; conversionRate: number | null }
interface OverviewData { range: { bucket: "hour" | "day" }; kpis: Kpis; previous: Kpis; series: SeriesPoint[]; live: number }
interface InsightT { tone: "good" | "bad" | "info"; title: string; detail: string; tab?: Tab }
type Row = Record<string, unknown> & { key: string };

const delta = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : Math.round(((a - b) / b) * 100));

function Overview({ siteId, range, go }: { siteId: string; range: string; go: (t: Tab) => void }) {
  const { data, error } = useReport<OverviewData>(siteId, "overview", { range });
  const ins = useReport<{ insights: InsightT[] }>(siteId, "insights", { range });
  const src = useReport<{ sources: Row[]; channels: Row[] }>(siteId, "sources", { range });
  const pg = useReport<{ pages: (Record<string, unknown> & { path: string })[] }>(siteId, "pages", { range });
  const [metric, setMetric] = useState<"visitors" | "visits" | "pageviews" | "conversions">("visitors");
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>Loading…</Empty>;
  const k = data.kpis, p = data.previous;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visitors" value={fmt.n(k.visitors)} delta={delta(k.visitors, p.visitors)} hint="Unique visitors. Without persistent IDs, a person can count once per day." />
        <Stat label="Visits" value={fmt.n(k.visits)} delta={delta(k.visits, p.visits)} />
        <Stat label="Page views" value={fmt.n(k.pageviews)} delta={delta(k.pageviews, p.pageviews)} />
        <Stat label="Conversion rate" value={fmt.pct(k.conversionRate)} delta={delta(k.conversionRate, p.conversionRate)} hint={`${k.conversions} converting visits`} />
        <Stat label="Pages / visit" value={k.pagesPerVisit} delta={delta(k.pagesPerVisit, p.pagesPerVisit)} />
        <Stat label="Avg. active time" value={fmt.ms(k.avgActiveMs)} delta={delta(k.avgActiveMs, p.avgActiveMs)} hint="Time the tab was actually visible" />
        <Stat label="Bounce rate" value={fmt.pct(k.bounceRate)} delta={delta(k.bounceRate, p.bounceRate)} invert hint="One page, no clicks, under 10 seconds" />
        <Stat label="Conversions" value={fmt.n(k.conversions)} delta={delta(k.conversions, p.conversions)} />
      </div>

      <Card title={<span className="flex items-center gap-2">Over time {data.live > 0 && <Badge tone="good">● {data.live} live now</Badge>}</span>}
        action={<Tabs tabs={[{ id: "visitors", label: "Visitors" }, { id: "visits", label: "Visits" }, { id: "pageviews", label: "Views" }, { id: "conversions", label: "Conversions" }]} value={metric} onChange={setMetric} />}>
        <AreaChart data={data.series} metric={metric} label={metric === "pageviews" ? "Views" : metric[0].toUpperCase() + metric.slice(1)} bucket={data.range.bucket} />
      </Card>

      <Card title="What to fix next" action={<span className="text-[12px] text-muted">Generated automatically from your data</span>}>
        {!ins.data ? <Empty>Analysing…</Empty> : !ins.data.insights.length ? <Empty>Nothing stands out yet. Check back once you have more visits.</Empty> : (
          <div className="grid gap-2 md:grid-cols-2">
            {ins.data.insights.map((i, n) => (
              <button key={n} onClick={() => i.tab && go(i.tab)} className="rounded-lg border border-line p-3 text-left hover:bg-panel-2">
                <div className="flex items-start gap-2">
                  <span className={i.tone === "good" ? "text-good" : i.tone === "bad" ? "text-bad" : "text-accent"}>{i.tone === "good" ? "▲" : i.tone === "bad" ? "▼" : "●"}</span>
                  <div>
                    <div className="text-[13px] font-semibold">{i.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted">{i.detail}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Top sources" action={<button className="text-[12px] text-accent" onClick={() => go("sources")}>All sources →</button>}>
          <BarList rows={(src.data?.sources ?? []).slice(0, 8).map(r => ({ key: r.key, value: Number(r.visits), cells: [fmt.n(r.visits), fmt.rate(r.conversions, r.visits)] }))} columns={["Visits", "Conv."]} />
        </Card>
        <Card title="Top pages" action={<button className="text-[12px] text-accent" onClick={() => go("pages")}>All pages →</button>}>
          <BarList rows={(pg.data?.pages ?? []).slice(0, 8).map(r => ({ key: r.path, value: Number(r.views), cells: [fmt.n(r.views), fmt.ms(r.avg_time_ms)] }))} columns={["Views", "Time"]} />
        </Card>
      </div>
    </div>
  );
}

// ── Sources ─────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = { direct: "Direct", organic: "Organic search", social: "Social", ai: "AI assistants", referral: "Referral", paid: "Paid", email: "Email", campaign: "Campaign", affiliate: "Affiliate" };

function Sources({ siteId, range }: { siteId: string; range: string }) {
  const { data, error } = useReport<Record<string, Row[]>>(siteId, "sources", { range });
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>Loading…</Empty>;
  const conv = (rows: Row[], label?: (k: string) => string) => rows.map(r => ({
    key: label ? label(r.key) : r.key, value: Number(r.visits),
    cells: [fmt.n(r.visits), fmt.rate(r.bounces, r.visits), fmt.rate(r.conversions, r.visits)],
  }));
  const simple = (rows: Row[]) => rows.map(r => ({ key: r.key, value: Number(r.visits), cells: [fmt.n(r.visits), fmt.rate(r.conversions, r.visits)] }));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Channels"><BarList rows={conv(data.channels, k => CHANNEL_LABEL[k] ?? k)} columns={["Visits", "Bounce", "Conv."]} /></Card>
      <Card title="Sources"><BarList rows={conv(data.sources)} columns={["Visits", "Bounce", "Conv."]} /></Card>
      <Card title="Campaigns (UTM)"><BarList rows={conv(data.campaigns)} columns={["Visits", "Bounce", "Conv."]} empty="No tagged campaigns yet. Add ?utm_campaign=… to your links." /></Card>
      <Card title="Landing pages"><BarList rows={conv(data.landing)} columns={["Visits", "Bounce", "Conv."]} /></Card>
      <Card title="Devices"><BarList rows={simple(data.devices)} columns={["Visits", "Conv."]} /></Card>
      <Card title="Countries"><BarList rows={simple(data.countries)} columns={["Visits", "Conv."]} empty="Country appears once deployed on Vercel or behind Cloudflare." /></Card>
      <Card title="Browsers"><BarList rows={simple(data.browsers)} columns={["Visits", "Conv."]} /></Card>
      <Card title="Operating systems"><BarList rows={simple(data.oses)} columns={["Visits", "Conv."]} /></Card>
    </div>
  );
}
