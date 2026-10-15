// app/api/sites/[id]/route.ts — one site: read setup info, edit goals/settings, delete.
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { appOrigin, patchSite, requireSite, setupInfo, type Goal } from "@/lib/sites";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  return NextResponse.json(JSON.parse(JSON.stringify(await setupInfo(r.site, appOrigin(req)))));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const r = await requireSite((await params).id, "editor");
  if (r instanceof NextResponse) return r;
  const body = await req.json().catch(() => ({})) as { goals?: Goal[]; settings?: { persistentIds?: boolean } };
  const fields: Parameters<typeof patchSite>[1] = {};
  if (Array.isArray(body.goals)) {
    const goals: Goal[] = [];
    for (const g of body.goals.slice(0, 20)) {
      if (!["app_link", "click_text", "path", "event"].includes(g?.type)) continue;
      const pattern = String(g.pattern ?? "").slice(0, 300);
      if (g.type !== "app_link") {
        if (!pattern) continue;
        try { new RegExp(pattern, "i"); } catch { return NextResponse.json({ error: `“${pattern}” isn't a valid pattern` }, { status: 400 }); }
      }
      goals.push({ id: String(g.id || `g_${goals.length}_${Date.now()}`).slice(0, 40), type: g.type, pattern, label: String(g.label ?? "").slice(0, 120) || pattern });
    }
    fields.goals = goals;
  }
  if (body.settings) fields.settings = { ...r.site.settings, persistentIds: !!body.settings.persistentIds };
  return NextResponse.json({ site: await patchSite(r.site.id, fields) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const r = await requireSite((await params).id, "admin");
  if (r instanceof NextResponse) return r;
  await q("delete from sites where id = $1", [r.site.id]);
  return NextResponse.json({ ok: true });
}
