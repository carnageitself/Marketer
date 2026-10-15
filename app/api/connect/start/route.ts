// app/api/connect/start/route.ts
// GET ?site=<id>&via=cloudflare|domainconnect&intent=dns|worker|worker_remove
// Sends the customer to sign in at their DNS provider. They come back to
// /api/connect/<via>/callback.
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, cloudflareOAuth, pkce } from "@/lib/dns/cloudflare-oauth";
import { applyUrl, discover, supports } from "@/lib/dns/domainconnect";
import { finish, newState, withFlow, type Intent, type Via } from "@/lib/dns/connect";
import { withSubdomain } from "@/lib/dns/apply";
import { cnameTarget } from "@/lib/dns/records";
import { appOrigin, patchSite, requireSite } from "@/lib/sites";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const origin = appOrigin(req);
  const via = p.get("via") as Via;
  const intent = (p.get("intent") ?? "dns") as Intent;
  const r = await requireSite(p.get("site") ?? "", "editor");
  if (r instanceof NextResponse) return finish(origin, null, false, r.status === 403 ? "You need editor access to change this website's setup." : "Sign in to Pagewise first");
  const site = r.site;
  const state = newState();

  if (via === "cloudflare") {
    if (!cloudflareOAuth()) return finish(origin, site.id, false, "Cloudflare sign-in isn't set up on this Pagewise server yet. Use an API token instead.");
    if (intent === "worker_remove" && !site.dns.worker) return finish(origin, site.id, false, "There's no Worker to remove");
    const { verifier, challenge } = pkce();
    const res = NextResponse.redirect(authorizeUrl(`${origin}/api/connect/cloudflare/callback`, state, challenge));
    return withFlow(res, { state, siteId: site.id, via, intent, verifier });
  }

  if (via === "domainconnect") {
    const target = await discover(site.domain);
    if (!target || !(await supports(target.settings))) {
      return finish(origin, site.id, false, "Your DNS provider doesn't offer sign-in setup for Pagewise yet. Use the records below instead.");
    }
    // The subdomain must be fixed before the provider writes the CNAME.
    const withSub = await withSubdomain(site);
    if (withSub.dns.subdomain !== site.dns.subdomain) await patchSite(site.id, { dns: withSub.dns });
    const tracking = !!cnameTarget() && !!withSub.dns.subdomain;
    const url = applyUrl(target, {
      vars: { verify: site.verify_token, ...(tracking ? { sub: withSub.dns.subdomain! } : {}) },
      groups: tracking ? ["verify", "tracking"] : ["verify"],
      redirectUri: `${origin}/api/connect/domainconnect/callback`,
      state,
    });
    return withFlow(NextResponse.redirect(url), { state, siteId: site.id, via, intent: "dns", provider: target.settings.providerName });
  }

  return finish(origin, site.id, false, "Unknown sign-in method");
}
