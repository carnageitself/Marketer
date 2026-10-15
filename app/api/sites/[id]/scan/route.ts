// app/api/sites/[id]/scan/route.ts — re-run the DNS / host / platform scan.
import { NextResponse } from "next/server";
import { scanDomain } from "@/lib/dns/detect";
import { patchSite, requireSite } from "@/lib/sites";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  const scan = await scanDomain(r.site.domain, r.site.id);
  return NextResponse.json({ site: await patchSite(r.site.id, { scan }) });
}
