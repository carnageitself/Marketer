// lib/sites.ts
// Sites (one per customer website) and the helpers every site-scoped API
// route uses to check ownership.
import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, newId, type SessionUser } from "./auth";
import { one, q } from "./db";
import { atLeast, roleIn, type Role } from "./team";

export type GoalType = "app_link" | "click_text" | "path" | "event";
export interface Goal { id: string; type: GoalType; pattern: string; label: string }

export interface ScanResult {
  scannedAt: string;
  reachable: boolean;
  finalUrl?: string;
  dnsProvider: { id: string; name: string; auto: boolean; nameservers: string[] } | null;
  host: { id: string; name: string } | null;
  platform: { id: string; name: string } | null;
  cloudflareProxied: boolean;
  scriptFound: boolean;
  records: { a: string[]; cname: string[]; wwwCname: string[] };
  /** Domain Connect: the DNS provider's sign-in-and-approve flow, when it offers one. */
  domainConnect?: { providerId: string; providerName: string; supported: boolean } | null;
  error?: string;
}

export interface DnsState {
  subdomain?: string;          // e.g. "t" → t.example.com serves the tracker first-party
  cnameTarget?: string;        // where it must point
  cnameVerifiedAt?: string;
  autoConfiguredAt?: string;
  autoProvider?: string;
  worker?: { accountId: string; zoneId: string; script: string; routeIds: string[]; installedAt: string };
  log?: { at: string; text: string; ok: boolean }[];
}

export interface Site {
  id: string; user_id: string; domain: string; verify_token: string; created_at: string;
  installed_at: string | null; verified_at: string | null;
  scan: Partial<ScanResult>; dns: DnsState; goals: Goal[]; settings: { persistentIds?: boolean };
}

/** Goals every new site starts with, so conversions show up with no setup. */
export const DEFAULT_GOALS: Goal[] = [
  { id: "g_app", type: "app_link", pattern: "", label: "Went to your app (app.yourdomain…)" },
  { id: "g_cta", type: "click_text", pattern: "sign ?up|register|get started|start (free|now|trial)|try (it )?free|create (an )?account|book (a )?demo|request (a )?demo|buy|checkout|subscribe|join", label: "Clicked a sign-up / buy button" },
  { id: "g_thanks", type: "path", pattern: "thank|success|welcome|confirm|order-received|checkout/complete", label: "Reached a thank-you page" },
];

/** "https://www.Example.com/pricing?x" → "example.com". Null if it isn't a domain. */
export function normaliseDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z]+:\/\//.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname.replace(/^www\./, "").replace(/\.$/, "");
    if (!/^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** The user's own websites, then those of every workspace they've joined. */
export async function listSites(userId: string) {
  return q<Site & { visitors_24h: number; live: number; role: Role; owner_email: string }>(
    `select s.*,
       case when s.user_id = $1 then 'owner' else m.role end as role,
       o.email as owner_email,
       (select count(distinct v.visitor_key)::int from visits v where v.site_id = s.id and v.started_at > now() - interval '24 hours') as visitors_24h,
       (select count(*)::int from visits v where v.site_id = s.id and v.last_seen_at > now() - interval '5 minutes') as live
     from sites s
     join users o on o.id = s.user_id
     left join team_members m on m.owner_id = s.user_id and m.user_id = $1 and m.accepted_at is not null
     where s.user_id = $1 or m.id is not null
     order by (s.user_id = $1) desc, s.created_at desc`,
    [userId],
  );
}

export async function createSite(userId: string, domain: string): Promise<Site> {
  const id = newId("pw", 9);
  const token = randomBytes(12).toString("hex");
  const site = await one<Site>(
    `insert into sites (id, user_id, domain, verify_token, goals) values ($1, $2, $3, $4, $5::text::jsonb) returning *`,
    [id, userId, domain, token, JSON.stringify(DEFAULT_GOALS)],
  );
  return site!;
}

export async function getSite(id: string): Promise<Site | null> {
  return one<Site>("select * from sites where id = $1", [id]);
}

export async function patchSite(id: string, fields: Partial<Pick<Site, "scan" | "dns" | "goals" | "settings" | "verified_at" | "installed_at">>) {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [k, v] of Object.entries(fields)) {
    vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
    sets.push(`${k} = $${vals.length}${["scan", "dns", "goals", "settings"].includes(k) ? "::text::jsonb" : ""}`);
  }
  if (!sets.length) return getSite(id);
  return one<Site>(`update sites set ${sets.join(", ")} where id = $1 returning *`, vals);
}

/** Appends to the per-site setup log shown on the setup page. */
export function withLog(dns: DnsState, text: string, ok = true): DnsState {
  return { ...dns, log: [...(dns.log ?? []), { at: new Date().toISOString(), text, ok }].slice(-30) };
}

export interface SiteAccess { site: Site; role: Role; ownerPlan: string }

/** A site the user can open (their own or a workspace they joined), with their role and the owner's plan. */
export async function siteAccess(id: string, user: SessionUser): Promise<SiteAccess | null> {
  const row = await one<Site & { owner_plan: string }>(
    "select s.*, u.plan as owner_plan from sites s join users u on u.id = s.user_id where s.id = $1", [id]);
  if (!row) return null;
  const role = await roleIn(user.id, row.user_id);
  if (!role) return null;
  const { owner_plan, ...site } = row;
  return { site, role, ownerPlan: owner_plan };
}

/**
 * For route handlers: the site if the signed-in user may do `need` on it,
 * otherwise a ready-made 401 / 404 / 403 response.
 */
export async function requireSite(id: string, need: Role = "viewer"): Promise<({ user: SessionUser } & SiteAccess) | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const access = await siteAccess(id, user);
  if (!access) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  if (!atLeast(access.role, need)) return NextResponse.json({ error: `You need ${need} access to do that. Ask the workspace owner.` }, { status: 403 });
  return { user, ...access };
}

/** Public origin of this app, used in the snippet and DNS targets. */
export function appOrigin(from?: Request | Headers): string {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (from) {
    const h = from instanceof Headers ? from : from.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  }
  return "http://localhost:3000";
}

/** Where the tracker loads from: the customer's own subdomain once its CNAME works. */
export function scriptOrigin(site: Site, fallback: string): string {
  if (site.dns.subdomain && site.dns.cnameVerifiedAt) return `https://${site.dns.subdomain}.${site.domain}`;
  return fallback;
}

export function snippet(site: Site, origin: string): string {
  return `<script defer src="${scriptOrigin(site, origin)}/t.js" data-site="${site.id}"></script>`;
}

/** Everything the setup screen needs; shared by the page and GET /api/sites/[id]. */
export async function setupInfo(site: Site, origin: string) {
  const { DNS_PROVIDER_LINKS } = await import("./dns/detect");
  const { PROVIDER_FIELDS } = await import("./dns/providers");
  const { cnameTarget, desiredRecords } = await import("./dns/records");
  const { cloudflareOAuth } = await import("./dns/cloudflare-oauth");
  return {
    site,
    snippet: snippet(site, origin),
    origin,
    records: desiredRecords(site),
    cnameAvailable: !!cnameTarget(),
    providerFields: PROVIDER_FIELDS,
    providerLink: site.scan.dnsProvider ? DNS_PROVIDER_LINKS[site.scan.dnsProvider.id] ?? null : null,
    /** Sign-in setup this server can offer (the rest falls back to API tokens). */
    signIn: { cloudflare: !!cloudflareOAuth() },
  };
}
