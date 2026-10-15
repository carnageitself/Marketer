"use client";
// Team management: invite people to your workspace with a role, change roles,
// remove people, and see (or leave) the workspaces you've been invited into.
import { useCallback, useEffect, useState } from "react";
import AppShell, { type Account } from "./AppShell";
import { Icon } from "./icons";
import { Badge, Button, Card, CopyButton, Empty, Loading, PageHeader, field, fmt } from "./ui";

type Role = "owner" | "admin" | "editor" | "viewer";
interface Member { id: string; email: string; name: string | null; role: Role; accepted_at: string | null; created_at: string }
interface Membership { owner_id: string; owner_email: string; owner_name: string | null; role: Role }
interface Data { owner: { id: string; email: string; plan: string; seats: number }; role: Role; members: Member[]; memberships: Membership[] }

export const ROLE_INFO: Record<Role, string> = {
  owner: "Everything, including billing.",
  admin: "Manage the team and websites, including deleting them.",
  editor: "Set up websites, DNS, goals and settings.",
  viewer: "See dashboards. Can't change anything.",
};

export default function TeamView({ email, userId, account }: { email: string; userId: string; account: Account }) {
  const [owner, setOwner] = useState(userId);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<Role>("viewer");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/team?owner=${encodeURIComponent(owner)}`);
    const d = await res.json();
    if (res.ok) setData(d); else setError(d.error ?? "Couldn't load the team");
  }, [owner]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function act(body: Record<string, unknown>) {
    setError(""); setUpgrade(false);
    const res = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner, ...body }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Something went wrong"); setUpgrade(res.status === 402); return null; }
    await load();
    return d;
  }

  const manageable = (data?.memberships ?? []).filter(m => m.role === "admin");
  const isOwner = data?.role === "owner";
  const canManage = data?.role === "owner" || data?.role === "admin";
  const used = data?.members.length ?? 0;

  return (
    <AppShell email={email} active="team" account={account}>
      <PageHeader title="Team" subtitle="Invite people to your workspace. They see every website in it, with the access you choose."
        actions={manageable.length > 0 && (
          <select value={owner} onChange={e => { setOwner(e.target.value); setData(null); setLink(null); }} className={field}>
            <option value={userId}>Your workspace</option>
            {manageable.map(m => <option key={m.owner_id} value={m.owner_id}>{m.owner_name || m.owner_email}&apos;s workspace</option>)}
          </select>
        )} />

      {error && (
        <div className="mb-6 rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-[13px]">
          {error}{upgrade && <> <a href="/billing" className="font-medium text-accent hover:underline">See plans →</a></>}
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {canManage && (
            <Card title="Invite someone" subtitle={data ? `${used} of ${data.owner.seats} teammate seats used on the ${data.owner.plan[0].toUpperCase() + data.owner.plan.slice(1)} plan` : undefined}>
              <form className="flex flex-col gap-2 md:flex-row" onSubmit={async e => {
                e.preventDefault(); setBusy(true);
                const d = await act({ action: "invite", email: invEmail, role: invRole });
                if (d?.link) { setLink({ email: invEmail, url: d.link }); setInvEmail(""); }
                setBusy(false);
              }}>
                <input type="email" required value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="teammate@company.com" className={`${field} h-10 min-w-0 flex-1`} />
                <select value={invRole} onChange={e => setInvRole(e.target.value as Role)} className={`${field} h-10 md:w-40`}>
                  {(isOwner ? ["admin", "editor", "viewer"] : ["editor", "viewer"]).map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>
                <Button type="submit" disabled={busy} className="h-10"><Icon name="plus" size={14} />{busy ? "Inviting…" : "Invite"}</Button>
              </form>
              <p className="mt-2 text-[12px] text-muted">{ROLE_INFO[invRole]}</p>
              {link && (
                <div className="mt-4 rounded-lg border border-good/25 bg-good-soft p-3.5">
                  <div className="text-[13px] font-medium">Invite created for {link.email}. Send them this link:</div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px]" title={link.url}>{link.url}</code>
                    <CopyButton text={link.url} label="Copy link" />
                  </div>
                  <p className="mt-2 text-[12px] text-muted">It works once, for {link.email} only. They can sign up or log in with that email, or with Google or Microsoft.</p>
                </div>
              )}
            </Card>
          )}

          <Card title="Members" flush>
            {!data ? <div className="p-5"><Loading rows={3} /></div> : (
              <div className="divide-y divide-line">
                <MemberRow name={owner === userId ? "You" : data.owner.email} email={data.owner.email} role="owner" />
                {!canManage && <p className="px-5 py-4 text-[13px] text-muted">Only the owner and admins can see and manage the rest of the team.</p>}
                {data.members.map(m => (
                  <MemberRow key={m.id} name={m.name ?? m.email} email={m.email} role={m.role} pending={!m.accepted_at} since={m.accepted_at ?? m.created_at}
                    control={canManage && (isOwner || m.role !== "admin") ? (
                      <div className="flex items-center gap-1.5">
                        {m.accepted_at && (
                          <select value={m.role} onChange={e => act({ action: "role", id: m.id, role: e.target.value })} className={`${field} h-8 py-0 text-[12.5px]`}>
                            {(isOwner ? ["admin", "editor", "viewer"] : ["editor", "viewer"]).map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                          </select>
                        )}
                        <button title={m.accepted_at ? "Remove from team" : "Revoke invite"} onClick={() => confirm(`${m.accepted_at ? "Remove" : "Revoke the invite for"} ${m.email}?`) && act({ action: "remove", id: m.id })}
                          className="rounded-md p-2 text-muted transition hover:bg-bad-soft hover:text-bad"><Icon name="trash" size={15} /></button>
                      </div>
                    ) : undefined} />
                ))}
                {canManage && !data.members.length && <Empty>No teammates yet. Invite someone above.</Empty>}
              </div>
            )}
          </Card>
        </div>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-8">
          <Card title="What each role can do">
            <ul className="space-y-3">
              {(Object.keys(ROLE_INFO) as Role[]).map(r => (
                <li key={r} className="text-[13px]">
                  <span className="font-semibold capitalize">{r}</span>
                  <span className="block text-muted">{ROLE_INFO[r]}</span>
                </li>
              ))}
            </ul>
          </Card>
          {!!data?.memberships.length && (
            <Card title="Workspaces you've joined" flush>
              <div className="divide-y divide-line">
                {data.memberships.map(m => (
                  <div key={m.owner_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{m.owner_name || m.owner_email}</div>
                      <div className="text-[12px] capitalize text-muted">{m.role}</div>
                    </div>
                    <Button variant="subtle" size="sm" onClick={async () => {
                      if (!confirm(`Leave ${m.owner_email}'s workspace? You'll lose access to its websites.`)) return;
                      await act({ action: "leave", owner: m.owner_id });
                      if (owner === m.owner_id) setOwner(userId);
                    }}>Leave</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function MemberRow({ name, email, role, pending, since, control }: { name: string; email: string; role: Role; pending?: boolean; since?: string; control?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold uppercase text-accent">{email[0]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13.5px] font-medium">
          <span className="truncate">{name}</span>
          {pending && <Badge tone="warn">Invite pending</Badge>}
        </div>
        <div className="truncate text-[12px] text-muted">{name !== email ? `${email} · ` : ""}{pending ? `invited ${fmt.ago(since)}` : since ? `joined ${fmt.ago(since)}` : "workspace owner"}</div>
      </div>
      {control ?? <Badge tone={role === "owner" ? "accent" : "neutral"}><span className="capitalize">{role}</span></Badge>}
    </div>
  );
}
