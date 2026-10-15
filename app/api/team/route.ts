// app/api/team/route.ts — manage a workspace's team.
// GET  ?owner=<id>                                   members + pending invites (+ the workspaces you belong to)
// POST { action: "invite", owner?, email, role }     → { link } to send to the invitee
// POST { action: "role", owner?, id, role }          change a member's role
// POST { action: "remove", owner?, id }              remove a member or revoke an invite
// POST { action: "leave", owner }                    leave someone else's workspace
// `owner` defaults to your own workspace. Owners and admins manage a team;
// admins can't touch other admins.
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { appOrigin } from "@/lib/sites";
import { atLeast, invite, isRole, memberships, roleIn, teamOf } from "@/lib/team";

export const runtime = "nodejs";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return bad("Sign in first", 401);
  const owner = new URL(req.url).searchParams.get("owner") || user.id;
  const role = await roleIn(user.id, owner);
  if (!role) return bad("Workspace not found", 404);
  const o = await one<{ email: string; plan: string }>("select email, plan from users where id = $1", [owner]);
  return NextResponse.json({
    owner: { id: owner, email: o?.email, plan: planOf(o?.plan).id, seats: planOf(o?.plan).limits.members },
    role, members: atLeast(role, "admin") ? await teamOf(owner) : [], memberships: await memberships(user.id),
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad("Sign in first", 401);
  const body = await req.json().catch(() => ({})) as { action?: string; owner?: string; email?: string; role?: string; id?: string };
  const owner = body.owner || user.id;

  if (body.action === "leave") {
    if (owner === user.id) return bad("You can't leave your own workspace");
    await q("delete from team_members where owner_id = $1 and user_id = $2", [owner, user.id]);
    return NextResponse.json({ ok: true });
  }

  const me = await roleIn(user.id, owner);
  if (!me || !atLeast(me, "admin")) return bad("Only the owner or an admin can manage this team", 403);
  // Admins manage editors and viewers; only the owner manages admins.
  const target = body.id ? await one<{ role: string; user_id: string | null }>("select role, user_id from team_members where id = $1 and owner_id = $2", [body.id, owner]) : null;
  if (body.id && !target) return bad("Member not found", 404);
  if (me !== "owner" && (target?.role === "admin" || body.role === "admin")) return bad("Only the owner can add or change admins", 403);

  if (body.action === "invite") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid email");
    if (!isRole(body.role)) return bad("Pick a role");
    const ownerRow = await one<{ email: string; plan: string }>("select email, plan from users where id = $1", [owner]);
    if (email === ownerRow?.email) return bad("That's the workspace owner");
    const plan = planOf(ownerRow?.plan);
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from team_members where owner_id = $1 and email <> $2", [owner, email]);
    if (n >= plan.limits.members) {
      return NextResponse.json({ error: plan.limits.members ? `The ${plan.name} plan includes ${plan.limits.members} teammates. Upgrade for more.` : "Inviting teammates is part of Pro. Upgrade to add your team.", upgrade: true }, { status: 402 });
    }
    if (await one("select 1 from team_members where owner_id = $1 and email = $2 and accepted_at is not null", [owner, email])) return bad("They're already on the team");
    const token = await invite(owner, user.id, email, body.role);
    return NextResponse.json({ link: `${appOrigin(req)}/invite/${token}` });
  }

  if (body.action === "role") {
    if (!isRole(body.role)) return bad("Pick a role");
    await q("update team_members set role = $3 where id = $1 and owner_id = $2", [body.id, owner, body.role]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove") {
    if (target?.user_id === user.id) return bad("Use “Leave” to remove yourself");
    await q("delete from team_members where id = $1 and owner_id = $2", [body.id, owner]);
    return NextResponse.json({ ok: true });
  }
  return bad("Unknown action");
}
