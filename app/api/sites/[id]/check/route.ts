// app/api/sites/[id]/check/route.ts
// Polled by the setup page: is the script installed, are the DNS records live?
// Marks the site verified the moment the TXT record resolves, and switches the
// snippet to the first-party subdomain once its CNAME does.
import { NextResponse } from "next/server";
import { safeFetch } from "@/lib/dns/detect";
import { checkRecords } from "@/lib/dns/records";
import { patchSite, requireSite, withLog } from "@/lib/sites";
import { one } from "@/lib/db";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  let site = r.site;

  const records = await checkRecords(site);
  const txt = records.find(x => x.type === "TXT");
  const cname = records.find(x => x.type === "CNAME");
  if (txt?.live && !site.verified_at) {
    site = (await patchSite(site.id, { verified_at: new Date().toISOString(), dns: withLog(site.dns, "Domain ownership verified (TXT record found)") }))!;
  }
  if (cname?.live && !site.dns.cnameVerifiedAt) {
    site = (await patchSite(site.id, { dns: withLog({ ...site.dns, cnameVerifiedAt: new Date().toISOString() }, `${cname.fqdn} is live; the script now loads from your own domain`) }))!;
  }

  // Look for the tag on the homepage until real events prove it's installed.
  let scriptOnHomepage: boolean | null = null;
  if (!site.installed_at) {
    try {
      const res = await safeFetch(`https://${site.domain}/`, { signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 (compatible; PagewiseSetup/1.0)" } });
      const html = await res.text();
      scriptOnHomepage = html.includes(site.id);
    } catch { scriptOnHomepage = null; }
  }
  const stats = await one<{ visits: number; last: string | null }>(
    "select count(*)::int as visits, max(last_seen_at) as last from visits where site_id = $1", [site.id]);

  return NextResponse.json({
    site,
    records,
    installed: !!site.installed_at,
    scriptOnHomepage,
    visits: stats?.visits ?? 0,
    lastSeen: stats?.last ?? null,
  });
}
