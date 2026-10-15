// app/api/sites/[id]/dns/route.ts
// Setup through the customer's DNS provider with a pasted API token (the
// fallback when signing in to the provider isn't available):
//   action "records"       create the TXT (+ CNAME) records
//   action "worker"        Cloudflare only: install the script on every page via a Worker
//   action "worker_remove" undo the Worker
// The pasted credentials are used for this request only and never stored.
import { NextResponse } from "next/server";
import { PROVIDER_FIELDS, type Creds } from "@/lib/dns/providers";
import { applyRecords, applyWorker, removeWorker } from "@/lib/dns/apply";
import { appOrigin, patchSite, requireSite, withLog } from "@/lib/sites";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSite((await params).id, "editor");
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
      if (body.action === "worker_remove") return NextResponse.json(await removeWorker(site, creds.token));
      return NextResponse.json(await applyWorker(site, creds.token, appOrigin(req)));
    }
    return NextResponse.json(await applyRecords(site, provider, creds));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    site = (await patchSite(site.id, { dns: withLog(site.dns, `${spec.label}: ${msg}`, false) }))!;
    return NextResponse.json({ error: msg, site }, { status: 502 });
  }
}
