// app/api/sites/[id]/stats/route.ts — every dashboard report, by ?report=.
import { NextResponse } from "next/server";
import { requireSite } from "@/lib/sites";
import * as stats from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  const { site } = r;
  const sp = new URL(req.url).searchParams;
  const range = stats.rangeOf(sp.get("range"));
  const goals = site.goals ?? [];
  const path = sp.get("path") ?? "/";
  try {
    switch (sp.get("report")) {
      case "overview": return NextResponse.json({ range, ...(await stats.overview(site.id, range, goals)) });
      case "insights": return NextResponse.json({ insights: await stats.insights(site.id, range, goals) });
      case "sources": return NextResponse.json(await stats.sources(site.id, range, goals));
      case "pages": return NextResponse.json(await stats.pages(site.id, range));
      case "page": return NextResponse.json(await stats.pageDetail(site.id, range, path));
      case "section_pages": return NextResponse.json({ pages: await stats.sectionPages(site.id, range) });
      case "sections": return NextResponse.json({ sections: await stats.sections(site.id, range, path, goals) });
      case "visitors": return NextResponse.json({ visits: await stats.visitorsList(site.id, range, goals) });
      case "journey": {
        const j = await stats.journey(site.id, sp.get("visit") ?? "", goals);
        return j ? NextResponse.json(j) : NextResponse.json({ error: "Visit not found" }, { status: 404 });
      }
      default: return NextResponse.json({ error: "Unknown report" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stats]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
