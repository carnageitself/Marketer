// app/api/collect/route.ts
// The collector every customer site's tracker posts to (public/t.js).
//
// Per batch: check the site id and that the request came from that site's
// domain, drop bots, derive the visitor key (daily-rotating hash of IP + UA,
// or the consented persistent id), attach the batch to an open visit or start
// one, then write the events. The IP is used only inside the hash and is
// never stored.
import { createHash, randomUUID } from "node:crypto";
import { convert, isCurrency, rates } from "@/lib/fx";
import { one, q } from "@/lib/db";
import { channelOf, clientIp, geo, parseUa, prettySource, sourceOf } from "@/lib/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const ok = () => new Response(null, { status: 204, headers: CORS });
const bad = (msg: string, status = 400) => new Response(msg, { status, headers: CORS });

const VISIT_IDLE_MIN = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PV_ID_RE = /^[0-9a-zA-Z-]{8,64}$/;

// Site lookups happen on every batch from every visitor, so cache them briefly.
const siteCache = new Map<string, { domain: string; installed: boolean; currency: string; exp: number } | null>();
async function siteInfo(id: string) {
  const hit = siteCache.get(id);
  if (hit !== undefined && (hit === null || hit.exp > Date.now())) return hit;
  const row = await one<{ domain: string; installed_at: string | null; currency: string }>("select domain, installed_at, currency from sites where id = $1", [id]);
  const info = row ? { domain: row.domain, installed: !!row.installed_at, currency: row.currency, exp: Date.now() + 60_000 } : null;
  siteCache.set(id, info);
  if (!info) setTimeout(() => siteCache.delete(id), 60_000);
  return info;
}

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const tsOf = (v: unknown) => {
  const n = typeof v === "number" ? v : NaN;
  const t = Date.now();
  return new Date(Number.isFinite(n) && n > t - 3_600_000 && n < t + 60_000 ? n : t).toISOString();
};

/** The request must come from the site's own domain (or a subdomain of it). */
function originAllowed(h: Headers, domain: string, appHost: string | null): boolean {
  const src = h.get("origin") || h.get("referer");
  if (!src) return false;
  let u: URL;
  try { u = new URL(src); } catch { return false; }
  const host = u.hostname.toLowerCase();
  if (host === domain || host.endsWith(`.${domain}`)) return true;
  // The built-in demo page lives on this app (/demo/<siteId>).
  if (appHost && u.host === appHost && (h.get("referer") ?? "").includes("/demo/")) return true;
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1")) return true;
  return false;
}

interface Ev {
  t?: string; ts?: number; pv?: string; path?: string; title?: string; prev?: string; q?: string; r?: string;
  ms?: number; scroll?: number; sid?: string; name?: string; idx?: number; vis?: number;
  label?: string; sec?: string; kind?: string; href?: string; tpath?: string; props?: Record<string, unknown>;
  amt?: number; cur?: string; oid?: string; src?: string;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64_000) return bad("too large", 413);
  let body: { site?: string; vid?: string; ctx?: Record<string, unknown>; events?: Ev[] };
  try { body = JSON.parse(raw); } catch { return bad("bad json"); }

  const siteId = str(body.site, 40);
  const events = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
  if (!siteId || !events.length) return bad("bad payload");

  const site = await siteInfo(siteId);
  if (!site) return bad("unknown site", 404);
  const h = req.headers;
  if (!originAllowed(h, site.domain, h.get("host"))) return bad("origin not allowed for this site", 403);

  const ua = h.get("user-agent") || "";
  const { device, browser, os } = parseUa(ua);
  if (device === "bot") return ok();

  const persistent = typeof body.vid === "string" && UUID_RE.test(body.vid);
  const day = new Date().toISOString().slice(0, 10);
  const key = persistent
    ? `v:${body.vid}`
    : `a:${createHash("sha256").update(`${clientIp(h)}|${ua}|${process.env.ANALYTICS_SALT ?? "dev-salt"}|${day}|${siteId}`).digest("hex").slice(0, 32)}`;

  // ── attach to an open visit, or start one ─────────────────────────────────
  let visit = await one<{ id: string }>(
    `select id from visits where site_id = $1 and visitor_key = $2 and last_seen_at > now() - interval '${VISIT_IDLE_MIN} minutes'
     order by last_seen_at desc limit 1`,
    [siteId, key],
  );
  const pvs = events.filter(e => e?.t === "pv" && typeof e.pv === "string" && PV_ID_RE.test(e.pv) && typeof e.path === "string");

  if (!visit) {
    const first = pvs[0] ?? events[0];
    let refHost: string | null = null;
    const referrer = str(first?.r, 1000);
    if (referrer) {
      try { refHost = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase(); } catch { refHost = null; }
      // Coming from the site itself (or its app) isn't a traffic source.
      if (refHost && (refHost === site.domain || refHost.endsWith(`.${site.domain}`))) refHost = null;
    }
    const params = new URLSearchParams(str(first?.q, 500) ?? "");
    const utmSource = str(params.get("utm_source"), 120);
    const utmMedium = str(params.get("utm_medium"), 120);
    const paidId = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid", "ttclid", "li_fat_id"].some(p => params.has(p));
    const g = geo(h);
    const ctx = body.ctx ?? {};
    visit = await one<{ id: string }>(
      `insert into visits (id, site_id, visitor_key, persistent, entry_path, referrer, referrer_host, source_name, channel,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content, device, browser, os, country, region, city,
         language, timezone, screen_w, viewport_w)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
      [
        randomUUID(), siteId, key, persistent, str(first?.path) ?? "/", referrer, refHost,
        utmSource ? prettySource(utmSource) : sourceOf(refHost).name, channelOf(refHost, utmMedium, utmSource, paidId),
        utmSource, utmMedium, str(params.get("utm_campaign"), 120), str(params.get("utm_term"), 120), str(params.get("utm_content"), 120),
        device, browser, os, g.country, g.region, g.city,
        str(ctx.lang, 35), str(ctx.tz, 64), int(ctx.sw, 0, 20000), int(ctx.vw, 0, 20000),
      ],
    );
  }
  const visitId = visit!.id;

  // ── events ────────────────────────────────────────────────────────────────
  let pageCount = 0;
  let exitPath: string | null = null;
  let lastTs = new Date(0).toISOString();
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const ts = tsOf(e.ts);
    if (ts > lastTs) lastTs = ts;
    const pvId = typeof e.pv === "string" && PV_ID_RE.test(e.pv) ? e.pv : null;
    const path = str(e.path) ?? "/";

    if (e.t === "pv" && pvId) {
      const rows = await q(
        `insert into pageviews (id, site_id, visit_id, ts, path, title, prev_path) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (id) do nothing returning id`,
        [pvId, siteId, visitId, ts, path, str(e.title, 200), str(e.prev)],
      );
      if (rows.length) { pageCount++; exitPath = path; }
    } else if (e.t === "leave" && pvId) {
      await q(
        `update pageviews set time_ms = greatest(coalesce(time_ms, 0), $3), max_scroll = greatest(coalesce(max_scroll, 0), $4)
         where id = $1 and site_id = $2`,
        [pvId, siteId, int(e.ms, 0, 1_800_000) ?? 0, int(e.scroll, 0, 100) ?? 0],
      );
    } else if (e.t === "sec" && pvId && str(e.sid, 120)) {
      await q(
        `insert into section_views (pageview_id, section_id, site_id, visit_id, ts, path, section_name, section_index, dwell_ms, max_visible)
         select $1, $2, site_id, visit_id, $3, $4, $5, $6, $7, $8 from pageviews where id = $1 and site_id = $9
         on conflict (pageview_id, section_id) do update set
           dwell_ms = greatest(section_views.dwell_ms, excluded.dwell_ms),
           max_visible = greatest(section_views.max_visible, excluded.max_visible),
           section_name = excluded.section_name`,
        [pvId, str(e.sid, 120), ts, path, str(e.name, 120), int(e.idx, 0, 500), int(e.ms, 0, 1_800_000) ?? 0, int(e.vis, 0, 100) ?? 0, siteId],
      );
    } else if (e.t === "click") {
      const kind = ["internal", "app", "external", "anchor", "mailto", "tel", "button", "form"].includes(e.kind ?? "") ? e.kind : "button";
      await q(
        `insert into clicks (site_id, visit_id, pageview_id, ts, path, kind, href, target_path, label, section_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [siteId, visitId, pvId, ts, path, kind, str(e.href, 1000), str(e.tpath), str(e.label, 120), str(e.sec, 120)],
      );
    } else if (e.t === "rev" && typeof e.amt === "number" && e.amt > 0 && e.amt <= 10_000_000) {
      // A sale. Unknown or missing currency means the site's own; amount_usd is fixed at today's rate.
      const cur = isCurrency(e.cur) ? e.cur! : site.currency;
      const usd = convert(e.amt, cur, "USD", await rates(), site.currency);
      const src = ["datalayer", "shopify", "woocommerce", "jsonld", "track"].includes(e.src ?? "") ? e.src : "track";
      await q(
        `insert into revenue_events (site_id, visit_id, pageview_id, ts, path, amount, currency, amount_usd, source, order_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (site_id, order_id) do nothing`,
        [siteId, visitId, pvId, ts, path, Math.round(e.amt * 100) / 100, cur, Math.round(usd * 100) / 100, src, str(e.oid, 80)],
      );
    } else if (e.t === "ev" && str(e.name, 100)) {
      const props = e.props && typeof e.props === "object" ? JSON.stringify(e.props).slice(0, 2000) : "{}";
      await q(
        `insert into custom_events (site_id, visit_id, ts, path, name, props) values ($1,$2,$3,$4,$5,$6::text::jsonb)`,
        [siteId, visitId, ts, path, str(e.name, 100), props.startsWith("{") && props.endsWith("}") ? props : "{}"],
      );
    }
  }

  await q(
    `update visits set last_seen_at = greatest(last_seen_at, $2::timestamptz, now()),
       page_count = page_count + $3, exit_path = coalesce($4, exit_path)
     where id = $1`,
    [visitId, lastTs, pageCount, exitPath],
  );

  if (!site.installed) {
    await q("update sites set installed_at = now() where id = $1 and installed_at is null", [siteId]);
    site.installed = true;
  }
  return ok();
}
