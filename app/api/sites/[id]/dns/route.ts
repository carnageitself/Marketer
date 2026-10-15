// app/api/sites/[id]/dns/route.ts
// One-click setup through the customer's DNS provider:
//   action "records"       create the TXT (+ CNAME) records
//   action "worker"        Cloudflare only: install the script on every page via a Worker
//   action "worker_remove" undo the Worker
// The pasted credentials are used for this request only and never stored.
import { NextResponse } from "next/server";
import { attachToOurProject, installCloudflareWorker, removeCloudflareWorker, writeRecords, PROVIDER_FIELDS, type Creds } from "@/lib/dns/providers";
import { checkRecords, cnameTarget, desiredRecords, pickSubdomain } from "@/lib/dns/records";
import { appOrigin, patchSite, requireSite, snippet, withLog, type DnsState } from "@/lib/sites";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  let site = r.site;
  const body = await req.json().catch(() => ({})) as { action?: string; provider?: string; creds?: Creds };
  const provider = body.provider ?? site.scan.dnsProvider?.id ?? "";
  const spec = PROVIDER_FIELDS[provider];
  if (!spec) return NextResponse.json({ error: "Automatic setup isn't available for this DNS provider" }, { status: 400 });
  const creds: Creds = {};
  for (const f of spec.fields) {
    const v = (body.creds?.[f.key] ?? "").trim();
    if (!v && !f.optional) return NextResponse.json({ error: `${f.label} is required` }, { status: 400 });
    if (v) creds[f.key] = v;
  }

  try {
    if (body.action === "worker" || body.action === "worker_remove") {
      if (provider !== "cloudflare") return NextResponse.json({ error: "Auto-install works with Cloudflare only" }, { status: 400 });
      if (body.action === "worker_remove") {
        if (!site.dns.worker) return NextResponse.json({ error: "No Worker installed" }, { status: 400 });
        await removeCloudflareWorker(creds.token, site.dns.worker);
        const { worker: _removed, ...rest } = site.dns;
        void _removed;
        site = (await patchSite(site.id, { dns: withLog(rest, "Removed the Cloudflare Worker; the script is no longer injected") }))!;
        return NextResponse.json({ site });
      }
      const { worker, logs } = await installCloudflareWorker(creds.token, site.domain, site.id, snippet(site, appOrigin(req)));
      let dns: DnsState = { ...site.dns, worker };
      for (const l of logs) dns = withLog(dns, l.text, l.ok);
      site = (await patchSite(site.id, { dns }))!;
      return NextResponse.json({ site, logs });
    }

    // ── records ──────────────────────────────────────────────────────────
    let dns = { ...site.dns };
    const target = cnameTarget();
    if (target && !dns.subdomain) dns = { ...dns, subdomain: await pickSubdomain(site.domain), cnameTarget: target };
    site = { ...site, dns };
    const logs = await writeRecords(provider, creds, site.domain, desiredRecords(site));
    if (logs.every(l => l.ok)) {
      dns = { ...dns, autoConfiguredAt: new Date().toISOString(), autoProvider: provider };
      if (dns.subdomain && target) {
        const attached = await attachToOurProject(`${dns.subdomain}.${site.domain}`);
        if (attached) logs.push(attached);
      }
    }
    for (const l of logs) dns = withLog(dns, l.text, l.ok);
    site = (await patchSite(site.id, { dns }))!;
    const records = await checkRecords(site);
    return NextResponse.json({ site, logs, records });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    site = (await patchSite(site.id, { dns: withLog(site.dns, `${spec.label}: ${msg}`, false) }))!;
    return NextResponse.json({ error: msg, site }, { status: 502 });
  }
}
