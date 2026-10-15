// app/api/connect/domainconnect/callback/route.ts
// The DNS provider sends the customer back here after they approve (or
// cancel). The provider has already written the records; we log it and the
// setup page's live check confirms them.
import { NextResponse, type NextRequest } from "next/server";
import { finish, readFlow } from "@/lib/dns/connect";
import { appOrigin, patchSite, requireSite, withLog } from "@/lib/sites";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const origin = appOrigin(req);
  const flow = readFlow(req, p.get("state"));
  if (!flow || flow.via !== "domainconnect") return finish(origin, null, false, "That sign-in link expired. Please try again.");
  const r = await requireSite(flow.siteId);
  if (r instanceof NextResponse) return finish(origin, null, false, "Sign in to Pagewise first");
  const site = r.site;
  const provider = flow.provider ?? "your DNS provider";

  const error = p.get("error");
  if (error) {
    await patchSite(site.id, { dns: withLog(site.dns, `${provider}: ${p.get("error_description") ?? error}`, false) });
    return finish(origin, site.id, false, error === "access_denied" ? `The change was cancelled at ${provider}, so nothing was changed.` : p.get("error_description") ?? error);
  }
  await patchSite(site.id, {
    dns: withLog({ ...site.dns, autoConfiguredAt: new Date().toISOString(), autoProvider: provider }, `Records approved at ${provider}`),
  });
  return finish(origin, site.id, true, `Approved at ${provider}. The records usually go live within a few minutes.`);
}
