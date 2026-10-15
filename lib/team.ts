// lib/team.ts
// Who can do what. Every account is a workspace owned by that user; teammates
// are invited into it with a role and then see all of the owner's websites.
//
//   owner   everything, including billing (implicit: the account itself)
//   admin   manage the team, add and delete websites
//   editor  setup, DNS, goals and settings
//   viewer  read-only dashboards
//
// Plan limits always follow the workspace owner's plan, not the viewer's.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { one, q } from "./db";
import { newId } from "./auth";

export type Role = "owner" | "admin" | "editor" | "viewer";
export const ROLES: Exclude<Role, "owner">[] = ["admin", "editor", "viewer"];
const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const atLeast = (role: Role, need: Role) => RANK[role] >= RANK[need];
export const isRole = (r: unknown): r is Exclude<Role, "owner"> => ROLES.includes(r as Exclude<Role, "owner">);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The user's role in `ownerId`'s workspace, or null if they're not in it. */
export async function roleIn(userId: string, ownerId: string): Promise<Role | null> {
  if (userId === ownerId) return "owner";
  const m = await one<{ role: Role }>(
    "select role from team_members where owner_id = $1 and user_id = $2 and accepted_at is not null", [ownerId, userId]);
  return m?.role ?? null;
}

/** Workspaces the user belongs to besides their own. */
export async function memberships(userId: string) {
  return q<{ owner_id: string; owner_email: string; owner_name: string | null; role: Role; plan: string }>(
    `select m.owner_id, u.email as owner_email, u.name as owner_name, m.role, u.plan
     from team_members m join users u on u.id = m.owner_id
     where m.user_id = $1 and m.accepted_at is not null order by u.email`, [userId]);
}

export async function teamOf(ownerId: string) {
  return q<{ id: string; email: string; name: string | null; role: Role; accepted_at: string | null; created_at: string }>(
    `select m.id, m.email, u.name, m.role, m.accepted_at, m.created_at
     from team_members m left join users u on u.id = m.user_id
     where m.owner_id = $1 order by m.accepted_at is null, m.created_at`, [ownerId]);
}

/** Creates (or re-issues) an invite and returns the one-time token for the link. */
export async function invite(ownerId: string, invitedBy: string, email: string, role: Exclude<Role, "owner">) {
  const token = randomBytes(24).toString("base64url");
  await q(
    `insert into team_members (id, owner_id, email, role, token_hash, invited_by) values ($1, $2, $3, $4, $5, $6)
     on conflict (owner_id, email) do update set role = excluded.role, token_hash = excluded.token_hash, invited_by = excluded.invited_by
       where team_members.accepted_at is null`,
    [newId("tm"), ownerId, email, role, sha256(token), invitedBy]);
  return token;
}

export async function inviteByToken(token: string) {
  return one<{ id: string; owner_id: string; email: string; role: Role; owner_email: string; owner_name: string | null }>(
    `select m.id, m.owner_id, m.email, m.role, u.email as owner_email, u.name as owner_name
     from team_members m join users u on u.id = m.owner_id
     where m.token_hash = $1 and m.accepted_at is null`, [sha256(token)]);
}

export async function acceptInvite(id: string, userId: string) {
  await q("update team_members set user_id = $2, accepted_at = now(), token_hash = null where id = $1", [id, userId]);
}
