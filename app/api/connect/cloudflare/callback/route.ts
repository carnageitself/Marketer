// app/api/connect/cloudflare/callback/route.ts
// Cloudflare sends the customer back here after they approve. We swap the code
// for a token, do the one thing they asked for, and revoke the token.
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, revoke } from "@/lib/dns/cloudflare-oauth";
import { applyRecords, applyWorker, removeWorker } from "@/lib/dns/apply";
import { finish, readFlow } from "@/lib/dns/connect";
import { appOrigin, patchSite, requireSite, withLog } from "@/lib/sites";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const origin = appOrigin(req);
  const flow = readFlow(req, p.get("state"));
  if (!flow || flow.via !== "cloudflare" || !flow.verifier) return finish(origin, null, false, "That sign-in link expired. Please try again.");
  if (p.get("error")) return finish(origin, flow.siteId, false, p.get("error") === "access_denied" ? "Cloudflare access wasn't granted, so nothing was changed." : p.get("error_description") ?? p.get("error")!);
  const r = await requireSite(flow.siteId, "editor");
  if (r instanceof NextResponse) return finish(origin, null, false, r.status === 403 ? "You need editor access to change this website's setup." : "Sign in to Pagewise first");
  let site = r.site;

  let token: string | null = null;
  try {
    token = await exchangeCode(p.get("code") ?? "", flow.verifier, `${origin}/api/connect/cloudflare/callback`);
    if (flow.intent === "worker") {
      await applyWorker(site, token, origin);
      return finish(origin, site.id, true, "Installed. Every page now carries the tag, with no code changes.");
    }
    if (flow.intent === "worker_remove") {
      await removeWorker(site, token);
      return finish(origin, site.id, true, "Removed the Cloudflare Worker.");
    }
    const { logs } = await applyRecords(site, "cloudflare", { token });
    return logs.every(l => l.ok)
      ? finish(origin, site.id, true, "DNS records added in Cloudflare. They usually go live within a minute.")
      : finish(origin, site.id, false, logs.find(l => !l.ok)?.text ?? "Some records couldn't be created");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    site = (await patchSite(site.id, { dns: withLog(site.dns, `Cloudflare: ${msg}`, false) }))!;
    return finish(origin, site.id, false, msg);
  } finally {
    if (token) await revoke(token);
  }
}
