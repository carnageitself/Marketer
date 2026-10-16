// lib/stats.ts
// Every report the dashboard shows, computed straight from raw events.
// All queries are scoped by site_id ($1) and a [from, to) window ($2, $3).
//
// Definitions (kept in one place so every tab agrees):
//   visitor     distinct visitor_key. Without persistent ids the key rotates
//               daily, so over multi-day ranges one person can count once per
//               day they visited (same trade-off as Plausible / Fathom).
//   visit       server-side session: ends after 30 min without activity.
//   active time time the tab was visible, summed over the visit's pages.
//   bounce      one page, no clicks, under 10 s of active time.
//   conversion  the visit matched any of the site's goals.
//   engaged     30 s+ of active time, or 2+ pages, or a conversion.
//   read-through a page view scrolled to at least 75% of the page.
//   revenue     tracked purchases (converted to the site's currency) if the
//               visit has any, otherwise the value of the goals it reached.
//               A purchase also counts as a conversion.
import "server-only";
import { q } from "./db";
import type { Goal } from "./sites";
import { money as formatMoney } from "./currency";

export type RangeKey = "24h" | "7d" | "30d" | "90d";
export interface Range { from: string; to: string; prevFrom: string; key: RangeKey; bucket: "hour" | "day" }

export function rangeOf(key: string | null): Range {
  const k = (["24h", "7d", "30d", "90d"].includes(key ?? "") ? key : "30d") as RangeKey;
  const ms = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[k] * 86_400_000;
  const to = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);
  return {
    key: k,
    to: to.toISOString(),
    from: new Date(to.getTime() - ms).toISOString(),
    prevFrom: new Date(to.getTime() - 2 * ms).toISOString(),
    bucket: k === "24h" ? "hour" : "day",
  };
}

// ── goals → SQL ─────────────────────────────────────────────────────────────

/** One boolean SQL expression per goal over visit alias `v` (with its value), parameters appended to `params`. */
function goalConds(goals: Goal[], params: unknown[]): { cond: string; value: number }[] {
  const out: { cond: string; value: number }[] = [];
  for (const g of goals) {
    const value = Number(g.value) > 0 ? Number(g.value) : 0;
    if (g.type === "app_link") {
      out.push({ cond: `exists (select 1 from clicks c where c.visit_id = v.id and c.kind = 'app')`, value });
      continue;
    }
    if (!g.pattern) continue;
    params.push(g.pattern);
    const p = `$${params.length}`;
    if (g.type === "click_text") out.push({ cond: `exists (select 1 from clicks c where c.visit_id = v.id and (c.label ~* ${p} or c.href ~* ${p}))`, value });
    if (g.type === "path") out.push({ cond: `exists (select 1 from pageviews p where p.visit_id = v.id and p.path ~* ${p})`, value });
    if (g.type === "event") out.push({ cond: `exists (select 1 from custom_events e where e.visit_id = v.id and e.name ~* ${p})`, value });
  }
  return out;
}

/** USD → site currency multiplier for revenue columns (1 when the site reports in USD). */
export interface Money { currency: string; fx: number }

/**
 * The enriched-visits CTE every report builds on. Params: $1 site, $2 from, $3 to,
 * then goal patterns. `revenue` is in the site's currency when `money` is given.
 */
function visitsCte(goals: Goal[], params: unknown[], money: Money = { currency: "USD", fx: 1 }) {
  const conds = goalConds(goals, params);
  params.push(money.fx);
  const fx = `$${params.length}::float8`;
  const purchased = `exists (select 1 from revenue_events r where r.visit_id = v.id)`;
  const goalValue = conds.some(c => c.value) ? `greatest(0, ${conds.filter(c => c.value).map(c => `case when ${c.cond} then ${c.value} else 0 end`).join(", ")})` : "0";
  return `vv as (
    select v.*,
      (${[...conds.map(c => c.cond), purchased].join(" or ")}) as converted,
      coalesce(nullif((select sum(r.amount_usd) from revenue_events r where r.visit_id = v.id), 0) * ${fx}, ${goalValue}, 0)::float8 as revenue,
      coalesce((select sum(p.time_ms) from pageviews p where p.visit_id = v.id), 0)::int as active_ms,
      (v.page_count <= 1
        and not exists (select 1 from clicks c where c.visit_id = v.id)
        and coalesce((select max(p.time_ms) from pageviews p where p.visit_id = v.id), 0) < 10000) as bounce
    from visits v
    where v.site_id = $1 and v.started_at >= $2 and v.started_at < $3
  )`;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 10 : null);
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;

// ── overview ────────────────────────────────────────────────────────────────

async function kpis(siteId: string, from: string, to: string, goals: Goal[], money?: Money) {
  const params: unknown[] = [siteId, from, to];
  const cte = visitsCte(goals, params, money);
  const [r] = await q<Row>(
    `with ${cte}
     select count(distinct visitor_key)::int as visitors, count(*)::int as visits,
       coalesce(sum(page_count), 0)::int as pageviews,
       coalesce(avg(active_ms), 0)::float8 as avg_active_ms,
       count(*) filter (where bounce)::int as bounces,
       count(*) filter (where converted)::int as conversions,
       count(*) filter (where active_ms >= 30000 or page_count >= 2 or converted)::int as engaged,
       count(*) filter (where exists (select 1 from clicks c where c.visit_id = vv.id))::int as clicked,
       (select count(*)::int from pageviews p where p.visit_id in (select id from vv)) as views_seen,
       (select count(*)::int from pageviews p where p.visit_id in (select id from vv) and p.max_scroll >= 75) as views_read,
       coalesce(sum(revenue), 0)::float8 as revenue,
       count(*) filter (where revenue > 0)::int as paying
     from vv`,
    params,
  );
  const visits = n(r.visits);
  return {
    visitors: n(r.visitors), visits, pageviews: n(r.pageviews),
    pagesPerVisit: visits ? Math.round((n(r.pageviews) / visits) * 100) / 100 : 0,
    avgActiveMs: Math.round(n(r.avg_active_ms)),
    bounceRate: pct(n(r.bounces), visits),
    conversions: n(r.conversions),
    conversionRate: pct(n(r.conversions), visits),
    engagedRate: pct(n(r.engaged), visits),
    clickRate: pct(n(r.clicked), visits),
    readThroughRate: pct(n(r.views_read), n(r.views_seen)),
    revenue: Math.round(n(r.revenue) * 100) / 100,
    revenuePerVisitor: n(r.visitors) ? Math.round((n(r.revenue) / n(r.visitors)) * 100) / 100 : 0,
    avgOrderValue: n(r.paying) ? Math.round((n(r.revenue) / n(r.paying)) * 100) / 100 : 0,
  };
}

/** How visits that converted differ from the rest: the "what do buyers do" comparison. */
async function converters(siteId: string, r: Range, goals: Goal[]) {
  const params: unknown[] = [siteId, r.from, r.to];
  const cte = visitsCte(goals, params);
  const rows = await q<Row>(
    `with ${cte},
     scroll as (select visit_id, avg(max_scroll) as s from pageviews where visit_id in (select id from vv) group by 1)
     select converted, count(*)::int as visits,
       coalesce(avg(page_count), 0)::float8 as pages, coalesce(avg(active_ms), 0)::float8 as active_ms,
       coalesce(avg(scroll.s), 0)::float8 as scroll,
       count(*) filter (where exists (select 1 from clicks c where c.visit_id = vv.id))::int as clicked,
       count(*) filter (where (select count(*) from visits x where x.site_id = $1 and x.visitor_key = vv.visitor_key and x.started_at < vv.started_at) > 0)::int as returning,
       mode() within group (order by coalesce(vv.source_name, 'Direct')) as top_source,
       mode() within group (order by coalesce(vv.entry_path, '/')) as top_entry,
       mode() within group (order by coalesce(vv.device, 'unknown')) as top_device
     from vv left join scroll on scroll.visit_id = vv.id
     group by converted`,
    params,
  );
  const side = (conv: boolean) => {
    const x = rows.find(row => !!row.converted === conv);
    const visits = n(x?.visits);
    return visits ? {
      visits, pages: Math.round(n(x!.pages) * 10) / 10, activeMs: Math.round(n(x!.active_ms)), scroll: Math.round(n(x!.scroll)),
      clickRate: pct(n(x!.clicked), visits), returningRate: pct(n(x!.returning), visits),
      topSource: String(x!.top_source ?? ""), topEntry: String(x!.top_entry ?? ""), topDevice: String(x!.top_device ?? ""),
    } : null;
  };
  return { converted: side(true), others: side(false) };
}

export async function overview(siteId: string, r: Range, goals: Goal[], money?: Money) {
  const params: unknown[] = [siteId, r.from, r.to];
  const cte = visitsCte(goals, params, money);
  const step = r.bucket === "hour" ? "1 hour" : "1 day";
  // Independent queries run together, so the overview waits for the slowest one, not the sum.
  const [cur, prev, series, [live], conv, anySale] = await Promise.all([
    kpis(siteId, r.from, r.to, goals, money),
    kpis(siteId, r.prevFrom, r.from, goals, money),
    q<Row>(
      `with ${cte},
       buckets as (select generate_series(date_trunc('${r.bucket}', $2::timestamptz), $3::timestamptz - interval '1 second', interval '${step}') as b)
       select to_char(b.b at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as t,
         count(distinct vv.visitor_key)::int as visitors, count(vv.id)::int as visits,
         coalesce(sum(vv.page_count), 0)::int as pageviews,
         count(vv.id) filter (where vv.converted)::int as conversions,
         round(coalesce(sum(vv.revenue), 0)::numeric, 2)::float8 as revenue
       from buckets b left join vv on date_trunc('${r.bucket}', vv.started_at) = b.b
       group by b.b order by b.b`,
      params,
    ),
    q<Row>(`select count(*)::int as n from visits where site_id = $1 and last_seen_at > now() - interval '5 minutes'`, [siteId]),
    converters(siteId, r, goals),
    q<Row>("select 1 from revenue_events where site_id = $1 limit 1", [siteId]),
  ]);
  // Revenue is "measured" once any goal has a value or a purchase has ever been recorded.
  const measured = goals.some(g => Number(g.value) > 0) || anySale.length > 0;
  return { kpis: cur, previous: prev, series, live: n(live.n), converters: conv, revenue: { measured, currency: money?.currency ?? "USD" } };
}

// ── sources & audience ──────────────────────────────────────────────────────

export async function sources(siteId: string, r: Range, goals: Goal[], money?: Money) {
  const params: unknown[] = [siteId, r.from, r.to];
  const cte = visitsCte(goals, params, money);
  const by = (expr: string, where = "true", limit = 50) => q<Row>(
    `with ${cte}
     select ${expr} as key, count(*)::int as visits, count(distinct visitor_key)::int as visitors,
       count(*) filter (where bounce)::int as bounces, count(*) filter (where converted)::int as conversions,
       coalesce(avg(active_ms), 0)::float8 as avg_active_ms,
       round(coalesce(sum(revenue), 0)::numeric, 2)::float8 as revenue
     from vv where ${where} group by 1 order by visits desc limit ${limit}`,
    params,
  );
  const [channels, sourcesList, campaigns, landing, devices, browsers, oses, countries] = await Promise.all([
    by("coalesce(channel, 'direct')"),
    by("coalesce(source_name, 'Direct')"),
    by("utm_campaign || coalesce(' · ' || utm_source, '') || coalesce(' / ' || utm_medium, '')", "utm_campaign is not null"),
    by("coalesce(entry_path, '/')"),
    by("coalesce(device, 'unknown')"),
    by("coalesce(browser, 'Other')"),
    by("coalesce(os, 'Other')"),
    by("coalesce(country, 'Unknown')"),
  ]);
  return { channels, sources: sourcesList, campaigns, landing, devices, browsers, oses, countries };
}

// ── pages ───────────────────────────────────────────────────────────────────

export async function pages(siteId: string, r: Range) {
  const p = [siteId, r.from, r.to];
  const list = await q<Row>(
    `select pv.path,
       count(*)::int as views,
       count(distinct v.visitor_key)::int as visitors,
       coalesce(avg(pv.time_ms) filter (where pv.time_ms is not null), 0)::float8 as avg_time_ms,
       coalesce(avg(pv.max_scroll) filter (where pv.max_scroll is not null), 0)::float8 as avg_scroll,
       (select count(*)::int from visits x where x.site_id = $1 and x.started_at >= $2 and x.started_at < $3 and x.entry_path = pv.path) as entrances,
       (select count(*)::int from visits x where x.site_id = $1 and x.started_at >= $2 and x.started_at < $3 and x.exit_path = pv.path) as exits
     from pageviews pv join visits v on v.id = pv.visit_id
     where pv.site_id = $1 and pv.ts >= $2 and pv.ts < $3
     group by pv.path order by views desc limit 100`, p);
  const links = await q<Row>(
    `select c.label, c.href, c.kind, c.path, c.section_id, count(*)::int as clicks, count(distinct c.visit_id)::int as visits
     from clicks c where c.site_id = $1 and c.ts >= $2 and c.ts < $3
     group by 1, 2, 3, 4, 5 order by clicks desc limit 50`, p);
  const flow = await q<Row>(
    `select prev_path as "from", path as "to", count(*)::int as navigations
     from pageviews where site_id = $1 and ts >= $2 and ts < $3 and prev_path is not null and prev_path <> path
     group by 1, 2 order by navigations desc limit 30`, p);
  return { pages: list, links, flow };
}

export async function pageDetail(siteId: string, r: Range, path: string) {
  const p = [siteId, r.from, r.to, path];
  const [base] = await q<Row>(
    `select count(*)::int as views,
       count(*) filter (where max_scroll is not null)::int as measured,
       count(*) filter (where max_scroll >= 25)::int as s25, count(*) filter (where max_scroll >= 50)::int as s50,
       count(*) filter (where max_scroll >= 75)::int as s75, count(*) filter (where max_scroll >= 90)::int as s100,
       coalesce(percentile_cont(0.5) within group (order by time_ms) filter (where time_ms is not null), 0)::float8 as median_time_ms
     from pageviews where site_id = $1 and ts >= $2 and ts < $3 and path = $4`, p);
  const measured = n(base.measured);
  const scroll = [25, 50, 75, 100].map(t => ({ depth: t, pct: pct(n(base[t === 100 ? "s100" : `s${t}`]), measured) }));
  const clicks = await q<Row>(
    `select label, href, kind, section_id, count(*)::int as clicks, count(distinct visit_id)::int as visits
     from clicks where site_id = $1 and ts >= $2 and ts < $3 and path = $4 group by 1, 2, 3, 4 order by clicks desc limit 30`, p);
  const cameFrom = await q<Row>(
    `select coalesce(prev_path, '(entry)') as path, count(*)::int as n from pageviews
     where site_id = $1 and ts >= $2 and ts < $3 and path = $4 group by 1 order by n desc limit 10`, p);
  const wentTo = await q<Row>(
    `select path, count(*)::int as n from pageviews where site_id = $1 and ts >= $2 and ts < $3 and prev_path = $4 and path <> $4
     group by 1 order by n desc limit 10`, p);
  const views = n(base.views);
  return {
    views, medianTimeMs: Math.round(n(base.median_time_ms)), scroll,
    clicks: clicks.map(c => ({ ...c, ctr: pct(n(c.clicks), views) })),
    cameFrom, wentTo,
  };
}

// ── sections: what people actually read, and what it's worth ───────────────

export async function sectionPages(siteId: string, r: Range) {
  return q<Row>(
    `select path, count(distinct pageview_id)::int as views, count(distinct section_id)::int as sections
     from section_views where site_id = $1 and ts >= $2 and ts < $3 group by path order by views desc limit 50`,
    [siteId, r.from, r.to]);
}

export async function sections(siteId: string, r: Range, path: string, goals: Goal[], money?: Money) {
  const params: unknown[] = [siteId, r.from, r.to];
  const cte = visitsCte(goals, params, money);
  params.push(path);
  const pathP = `$${params.length}`;
  const rows = await q<Row>(
    `with ${cte},
     page_visits as (
       select distinct pv.visit_id from pageviews pv join vv on vv.id = pv.visit_id where pv.path = ${pathP}
     ),
     page_views as (
       select count(*)::int as n from pageviews pv where pv.site_id = $1 and pv.ts >= $2 and pv.ts < $3 and pv.path = ${pathP}
     ),
     sv as (
       select s.* from section_views s join vv on vv.id = s.visit_id where s.path = ${pathP}
     ),
     per as (
       select section_id, max(section_name) as name, min(section_index)::int as idx,
         count(distinct pageview_id)::int as seen,
         coalesce(avg(dwell_ms), 0)::float8 as avg_dwell_ms,
         coalesce(percentile_cont(0.5) within group (order by dwell_ms), 0)::float8 as median_dwell_ms,
         count(*) filter (where dwell_ms >= 3000)::int as engaged,
         coalesce(avg(max_visible), 0)::float8 as avg_visible
       from sv group by section_id
     ),
     readers as (
       select section_id, visit_id from sv where dwell_ms >= 1000 group by section_id, visit_id
     )
     select per.*, (select n from page_views) as page_views,
       (select count(*)::int from vv where vv.id in (select visit_id from page_visits)) as page_visits,
       (select count(*)::int from readers r where r.section_id = per.section_id) as reader_visits,
       (select count(*)::int from readers r join vv on vv.id = r.visit_id where r.section_id = per.section_id and vv.converted) as reader_conversions,
       (select count(*)::int from vv where vv.id in (select visit_id from page_visits) and vv.converted) as page_conversions,
       (select coalesce(sum(vv.revenue), 0)::float8 from readers r join vv on vv.id = r.visit_id where r.section_id = per.section_id) as reader_revenue,
       (select coalesce(sum(vv.revenue), 0)::float8 from vv where vv.id in (select visit_id from page_visits)) as page_revenue,
       (select count(*)::int from clicks c join vv on vv.id = c.visit_id where c.path = ${pathP} and c.section_id = per.section_id) as clicks
     from per order by idx, section_id`,
    params,
  );
  return rows.map(s => {
    const pageViews = n(s.page_views), seen = n(s.seen);
    const readers = n(s.reader_visits), readerConv = n(s.reader_conversions);
    const nonReaders = n(s.page_visits) - readers, nonReaderConv = n(s.page_conversions) - readerConv;
    // Below 5 visits on either side a rate is noise, so none is shown.
    const MIN = 5;
    const rRate = readers >= MIN ? readerConv / readers : null;
    const nRate = nonReaders >= MIN ? nonReaderConv / nonReaders : null;
    return {
      id: s.section_id as string, name: (s.name as string) || (s.section_id as string), index: n(s.idx),
      seen, reach: pct(seen, pageViews), avgDwellMs: Math.round(n(s.avg_dwell_ms)), medianDwellMs: Math.round(n(s.median_dwell_ms)),
      engagedRate: pct(n(s.engaged), seen), avgVisible: Math.round(n(s.avg_visible)), clicks: n(s.clicks),
      readers, readerConvRate: rRate === null ? null : Math.round(rRate * 1000) / 10,
      nonReaders, nonReaderConvRate: nRate === null ? null : Math.round(nRate * 1000) / 10,
      lift: rRate !== null && nRate !== null && nRate > 0 ? Math.round((rRate / nRate) * 10) / 10 : null,
      // Revenue per visit for readers vs everyone else on the page (association, not proof of cause).
      readerRevPerVisit: readers >= MIN ? Math.round((n(s.reader_revenue) / readers) * 100) / 100 : null,
      nonReaderRevPerVisit: nonReaders >= MIN ? Math.round(((n(s.page_revenue) - n(s.reader_revenue)) / nonReaders) * 100) / 100 : null,
      pageVisits: n(s.page_visits),
    };
  });
}

// ── visitors & visit replay ─────────────────────────────────────────────────

export async function visitorsList(siteId: string, r: Range, goals: Goal[]) {
  const params: unknown[] = [siteId, r.from, r.to];
  const cte = visitsCte(goals, params);
  return q<Row>(
    `with ${cte}
     select id, visitor_key, persistent, started_at, last_seen_at, entry_path, exit_path, page_count, active_ms, converted, bounce,
       coalesce(source_name, 'Direct') as source, coalesce(channel, 'direct') as channel, utm_campaign,
       device, browser, os, country, city,
       (select count(*)::int from visits x where x.site_id = $1 and x.visitor_key = vv.visitor_key) as visit_number,
       (select s.section_name from section_views s where s.visit_id = vv.id order by s.dwell_ms desc limit 1) as top_section
     from vv order by started_at desc limit 200`,
    params,
  );
}

export async function journey(siteId: string, visitId: string, goals: Goal[]) {
  // No date window: real dates rather than '-infinity'/'infinity', which
  // postgres.js can't serialize (it runs every timestamp through new Date()).
  const params: unknown[] = [siteId, "1970-01-01T00:00:00Z", "9999-12-31T00:00:00Z"];
  const cte = visitsCte(goals, params);
  params.push(visitId);
  const [visit] = await q<Row>(`with ${cte} select * from vv where id = $${params.length}`, params);
  if (!visit) return null;
  const pvs = await q<Row>(`select id, ts, path, title, prev_path, time_ms, max_scroll from pageviews where visit_id = $1 and site_id = $2 order by ts`, [visitId, siteId]);
  const secs = await q<Row>(`select pageview_id, section_id, section_name, section_index, dwell_ms, max_visible from section_views where visit_id = $1 and site_id = $2 order by section_index`, [visitId, siteId]);
  const clicks = await q<Row>(`select pageview_id, ts, label, kind, href, section_id from clicks where visit_id = $1 and site_id = $2 order by ts`, [visitId, siteId]);
  const events = await q<Row>(`select ts, path, name, props from custom_events where visit_id = $1 and site_id = $2 order by ts`, [visitId, siteId]);
  const others = await q<Row>(
    `select id, started_at, page_count, entry_path from visits where site_id = $1 and visitor_key = $2 and id <> $3 order by started_at desc limit 20`,
    [siteId, visit.visitor_key, visitId]);
  return {
    visit,
    pages: pvs.map(p => ({
      ...p,
      sections: secs.filter(s => s.pageview_id === p.id),
      clicks: clicks.filter(c => c.pageview_id === p.id),
    })),
    events,
    otherVisits: others,
  };
}

// ── insights: the plain-language "what to fix" list ─────────────────────────

export interface Insight { tone: "good" | "bad" | "info"; title: string; detail: string; tab?: string }

export async function insights(siteId: string, r: Range, goals: Goal[], money?: Money): Promise<Insight[]> {
  const out: Insight[] = [];
  const [ov, src, pg, sp] = await Promise.all([overview(siteId, r, goals, money), sources(siteId, r, goals, money), pages(siteId, r), sectionPages(siteId, r)]);
  const cash = (v: number) => formatMoney(v, money?.currency);
  const perMonth = 30 / Math.max(1, (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000);
  const k = ov.kpis, prev = ov.previous;
  if (k.visits === 0) return [{ tone: "info", title: "Waiting for your first visitors", detail: "As soon as people visit your site, insights appear here automatically." }];

  if (prev.visits >= 10) {
    const change = Math.round(((k.visits - prev.visits) / prev.visits) * 100);
    if (Math.abs(change) >= 15) out.push({
      tone: change > 0 ? "good" : "bad",
      title: `Traffic is ${change > 0 ? "up" : "down"} ${Math.abs(change)}%`,
      detail: `${k.visits} visits vs ${prev.visits} in the previous period.`, tab: "sources",
    });
  }

  // Section reading funnel + money sections on the busiest page with section data.
  const top = sp[0];
  if (top) {
    const secs = (await sections(siteId, r, top.path as string, goals, money)).filter(s => s.seen > 0);
    // The money opportunity, ranked first: a section whose readers spend more but that few reach.
    const opp = secs
      .filter(s => s.readerRevPerVisit !== null && s.nonReaderRevPerVisit !== null && (s.reach ?? 100) < 70)
      .map(s => ({ s, gain: 0.1 * s.pageVisits * (s.readerRevPerVisit! - s.nonReaderRevPerVisit!) * perMonth }))
      .sort((a, b) => b.gain - a.gain)[0];
    if (opp && opp.gain >= 1) out.push({
      tone: "good",
      title: `About ${cash(opp.gain)} a month more if 10% more visitors reach “${opp.s.name}”`,
      detail: `Visitors who read it bring in ${cash(opp.s.readerRevPerVisit!)} per visit vs ${cash(opp.s.nonReaderRevPerVisit!)} for those who don't, but only ${opp.s.reach}% of views on ${top.path} reach it. (Based on how readers behave, not proof it causes the sale.)`,
      tab: "sections",
    });
    let worst: { from: string; to: string; a: number; b: number } | null = null;
    for (let i = 1; i < secs.length; i++) {
      const a = secs[i - 1].reach ?? 0, b = secs[i].reach ?? 0;
      if (a >= 20 && a - b > (worst ? worst.a - worst.b : 15)) worst = { from: secs[i - 1].name, to: secs[i].name, a: Math.round(a), b: Math.round(b) };
    }
    if (worst) out.push({
      tone: "bad",
      title: `Readers drop off after “${worst.from}” on ${top.path}`,
      detail: `${worst.a}% of page views see “${worst.from}”, but only ${worst.b}% get to “${worst.to}”. Tighten that section or move your call-to-action above it.`,
      tab: "sections",
    });
    const lifters = secs.filter(s => s.lift !== null && s.readers >= 5 && s.nonReaders >= 5).sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
    if (lifters[0] && (lifters[0].lift ?? 0) >= 1.3) {
      const m = lifters[0];
      out.push({
        tone: "good",
        title: `“${m.name}” makes people convert ${m.lift}× more`,
        detail: `Visitors who read it convert at ${m.readerConvRate}% vs ${m.nonReaderConvRate}% for those who didn't, but only ${m.reach}% of page views reach it. Move it higher.`,
        tab: "sections",
      });
    }
    // Headers, footers and nav bars are glanced at by design, so they never count as "skimmed".
    const ignored = secs.filter(s => s.seen >= 10 && (s.engagedRate ?? 100) < 25 && s.index > 0 && !/^(footer|header|navigation)$/i.test(s.name));
    if (ignored[0]) out.push({
      tone: "info",
      title: `“${ignored[0].name}” is skimmed, not read`,
      detail: `Only ${ignored[0].engagedRate}% of people who see it stay 3+ seconds. Consider shortening it or giving it a clearer headline.`,
      tab: "sections",
    });
  }

  const conv = src.sources.filter(s => n(s.visits) >= 10);
  if (k.conversionRate !== null && k.conversions > 0 && conv.length > 1) {
    const best = [...conv].sort((a, b) => n(b.conversions) / n(b.visits) - n(a.conversions) / n(a.visits))[0];
    const rate = pct(n(best.conversions), n(best.visits)) ?? 0;
    if (rate > (k.conversionRate ?? 0) * 1.3) out.push({
      tone: "good",
      title: `${best.key} visitors convert best (${rate}%)`,
      detail: `Your average is ${k.conversionRate}%. Worth putting more effort into ${best.key}.`, tab: "sources",
    });
  }

  const busy = pg.pages.filter(p => n(p.views) >= 20);
  const shallow = busy.find(p => n(p.avg_scroll) > 0 && n(p.avg_scroll) < 45);
  if (shallow) out.push({
    tone: "bad",
    title: `Most visitors stop early on ${shallow.path}`,
    detail: `Average scroll depth is ${Math.round(n(shallow.avg_scroll))}%. Whatever is below the fold there is barely seen.`, tab: "pages",
  });
  const leaky = busy.filter(p => n(p.exits) / n(p.views) > 0.7 && n(p.views) >= 30).sort((a, b) => n(b.views) - n(a.views))[0];
  if (leaky) out.push({
    tone: "bad",
    title: `${leaky.path} is where visits end`,
    detail: `${Math.round((100 * n(leaky.exits)) / n(leaky.views))}% of its views are the last page of the visit. Add a clear next step.`, tab: "pages",
  });

  // The source that earns the most per visit.
  const earner = src.sources.filter(x => n(x.visits) >= 10 && n(x.revenue) > 0).sort((a, b) => n(b.revenue) / n(b.visits) - n(a.revenue) / n(a.visits))[0];
  if (earner && k.revenue > 0 && n(earner.revenue) / n(earner.visits) > (k.revenue / k.visits) * 1.3) out.push({
    tone: "good",
    title: `${earner.key} visitors are worth ${cash(n(earner.revenue) / n(earner.visits))} each`,
    detail: `That's ${Math.round(((n(earner.revenue) / n(earner.visits)) / (k.revenue / k.visits)) * 10) / 10}× your average of ${cash(k.revenue / k.visits)} per visit.`, tab: "sources",
  });

  // Behaviour across the whole site, once there's enough to judge.
  if (k.visits >= 30) {
    const c = ov.converters.converted, o = ov.converters.others;
    if (c && o && o.pages > 0 && c.pages / o.pages >= 1.5) out.push({
      tone: "good",
      title: `Visitors who explore convert: ${Math.round((c.pages / o.pages) * 10) / 10}× more pages`,
      detail: `Converters view ${c.pages} pages per visit vs ${o.pages} for everyone else. Link your landing pages to the pages converters read next.`, tab: "pages",
    });
    if (k.clickRate !== null && k.clickRate < 20) out.push({
      tone: "bad",
      title: `Only ${k.clickRate}% of visits click anything`,
      detail: "Most visitors read and leave. Make the next step obvious: one clear button near the top of your busiest pages.", tab: "pages",
    });
    if (k.readThroughRate !== null && k.readThroughRate < 20) out.push({
      tone: "bad",
      title: `Only ${k.readThroughRate}% of page views reach the end`,
      detail: "Content and calls to action near the bottom of your pages are rarely seen. Move the important parts up.", tab: "sections",
    });
  }

  if (k.conversions === 0 && k.visits >= 30) out.push({
    tone: "info",
    title: "No conversions detected yet",
    detail: "If your sign-up or checkout uses different wording, add a goal in Settings so conversions get counted.", tab: "settings",
  });
  const topLink = pg.links.find(l => l.kind !== "anchor");
  if (topLink) out.push({
    tone: "info",
    title: `Most-clicked: “${topLink.label || topLink.href}”`,
    detail: `${topLink.clicks} clicks on ${topLink.path}${topLink.section_id ? ` (in “${topLink.section_id}”)` : ""}.`, tab: "pages",
  });
  return out.slice(0, 6);
}
