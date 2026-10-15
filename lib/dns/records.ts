// lib/dns/records.ts
// Which records a site needs, and whether they are live yet (checked against
// public resolvers, so the answer matches what the rest of the internet sees).
import "server-only";
import type { DesiredRecord } from "./providers";
import { resolver } from "./detect";
import type { Site } from "../sites";

export const TXT_LABEL = "_pagewise";
const SUB_CANDIDATES = ["t", "px", "ev", "pwt"];

/** CNAME target for first-party tracking; unset until the app is deployed with one. */
export const cnameTarget = () => process.env.CNAME_TARGET?.replace(/\.$/, "") || null;

/** First candidate subdomain that has no records yet, so we never shadow one of theirs. */
export async function pickSubdomain(domain: string): Promise<string> {
  const r = resolver();
  for (const sub of SUB_CANDIDATES) {
    const fqdn = `${sub}.${domain}`;
    const [a, c] = await Promise.all([r.resolve4(fqdn).catch(() => []), r.resolveCname(fqdn).catch(() => [])]);
    if (!a.length && !c.length) return sub;
  }
  return `pw${Math.random().toString(36).slice(2, 6)}`;
}

export function desiredRecords(site: Site): DesiredRecord[] {
  const recs: DesiredRecord[] = [{
    type: "TXT", name: TXT_LABEL, fqdn: `${TXT_LABEL}.${site.domain}`,
    value: `pagewise-verify=${site.verify_token}`, purpose: "proves you own the domain",
  }];
  const target = site.dns.cnameTarget ?? cnameTarget();
  if (target && site.dns.subdomain) {
    recs.push({
      type: "CNAME", name: site.dns.subdomain, fqdn: `${site.dns.subdomain}.${site.domain}`,
      value: target, purpose: "serves the tracker from your own domain so ad blockers don't drop it",
    });
  }
  return recs;
}

export interface RecordStatus extends DesiredRecord { live: boolean; found: string[] }

export async function checkRecords(site: Site): Promise<RecordStatus[]> {
  const r = resolver();
  return Promise.all(desiredRecords(site).map(async rec => {
    let found: string[] = [];
    try {
      found = rec.type === "TXT"
        ? (await r.resolveTxt(rec.fqdn)).map(parts => parts.join(""))
        : (await r.resolveCname(rec.fqdn)).map(v => v.toLowerCase().replace(/\.$/, ""));
    } catch { found = []; }
    return { ...rec, found, live: found.some(v => v === rec.value.toLowerCase() || v === rec.value) };
  }));
}
