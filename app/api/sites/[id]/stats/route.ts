// app/api/sites/[id]/stats/route.ts — every dashboard report, by ?report=.
import { NextResponse } from "next/server";
import { getSite, requireSite } from "@/lib/sites";
import * as stats from "@/lib/stats";
import { planOf, RANGE_DAYS } from "@/lib/plans";
import { convert, rates } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  const { site } = r;
  const owner = site.demo_of ? (await getSite(site.demo_of)) ?? site : site;
  const plan = planOf(r.ownerPlan);
  const locked = (what: string) => NextResponse.json({ error: `${what} is part of Pro. Upgrade to unlock it.`, upgrade: true }, { status: 402 });
  const sp = new URL(req.url).searchParams;
  const range = stats.rangeOf(sp.get("range"));
  if ((RANGE_DAYS[range.key] ?? 30) > plan.limits.historyDays) return locked(`${range.key === "90d" ? "90 days" : "Longer"} of history`);
  const goals = owner.goals ?? [];
  const path = sp.get("path") ?? "/";
  // Revenue is stored in USD and shown in the site's currency at today's rate.
  const money: stats.Money = { currency: owner.currency || "USD", fx: convert(1, "USD", owner.currency || "USD", await rates()) };
  // Free sees revenue totals; the breakdown by section and source is part of Pro.
  const strip = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
    plan.can.revenueDetail ? rows : rows.map(x => ({ ...x, ...Object.fromEntries(keys.map(k => [k, null])) }));
  try {
    switch (sp.get("report")) {
      case "overview": {
        const o = await stats.overview(site.id, range, goals, money);
        return NextResponse.json({ range, ...o, converters: plan.can.converters ? o.converters : null });
      }
      case "insights": {
        const all = await stats.insights(site.id, range, goals, money);
        return NextResponse.json({ insights: plan.can.allInsights ? all : all.slice(0, 3), hidden: plan.can.allInsights ? 0 : Math.max(0, all.length - 3) });
      }
      case "sources": {
        const s = await stats.sources(site.id, range, goals, money);
        return NextResponse.json({ ...Object.fromEntries(Object.entries(s).map(([k, rows]) => [k, strip(rows, ["revenue"])])), revenueLocked: !plan.can.revenueDetail });
      }
      case "pages": return NextResponse.json(await stats.pages(site.id, range));
      case "page": return NextResponse.json(await stats.pageDetail(site.id, range, path));
      case "section_pages": return NextResponse.json({ pages: await stats.sectionPages(site.id, range) });
      case "sections": return NextResponse.json({ sections: strip(await stats.sections(site.id, range, path, goals, money), ["readerRevPerVisit", "nonReaderRevPerVisit"]), revenueLocked: !plan.can.revenueDetail, currency: money.currency });
      case "visitors": return NextResponse.json({ visits: await stats.visitorsList(site.id, range, goals) });
      case "journey": {
        if (!plan.can.replay) return locked("Visit replay");
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
