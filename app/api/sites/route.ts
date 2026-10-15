// app/api/sites/route.ts — list the user's sites, add a site (and scan it).
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { scanDomain } from "@/lib/dns/detect";
import { createSite, listSites, normaliseDomain, patchSite } from "@/lib/sites";

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
  const site = await createSite(user.id, domain);
  // Scan straight away so the setup page opens already knowing the DNS
  // provider, host and platform.
  const scan = await scanDomain(domain, site.id);
  await patchSite(site.id, { scan });
  return NextResponse.json({ site: { ...site, scan } });
}
