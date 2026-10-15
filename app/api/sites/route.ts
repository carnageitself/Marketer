// app/api/sites/route.ts — list the user's sites, add a site (and scan it).
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { scanDomain } from "@/lib/dns/detect";
import { createSite, listSites, normaliseDomain, patchSite } from "@/lib/sites";
import { planOf } from "@/lib/plans";
import { q } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ sites: await listSites(user.id) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { url } = await req.json().catch(() => ({})) as { url?: string };
  const domain = normaliseDomain(url ?? "");
  if (!domain) return NextResponse.json({ error: "That doesn't look like a website address, e.g. example.com" }, { status: 400 });
  const plan = planOf(user.plan);
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from sites where user_id = $1", [user.id]);
  if (n >= plan.limits.sites) {
    return NextResponse.json({ error: `Your ${plan.name} plan includes ${plan.limits.sites} website${plan.limits.sites === 1 ? "" : "s"}. Upgrade to add more.`, upgrade: true }, { status: 402 });
  }
  const site = await createSite(user.id, domain);
  // Scan straight away so the setup page opens already knowing the DNS
  // provider, host and platform.
  const scan = await scanDomain(domain, site.id);
  await patchSite(site.id, { scan });
  return NextResponse.json({ site: { ...site, scan } });
}
