import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { acceptInvite, inviteByToken } from "@/lib/team";
import { Logo } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Accepts a team invite: only for the invited email, and only once. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await inviteByToken(token);
  if (!inv) return <Message title="This invite has expired" body="It may have been used already or revoked. Ask whoever invited you for a new link." />;

  const user = await currentUser();
  if (!user) {
    const exists = await one("select 1 from users where email = $1", [inv.email]);
    redirect(`/login?${new URLSearchParams({ ...(exists ? {} : { mode: "signup" }), next: `/invite/${token}`, email: inv.email, invite: inv.owner_name || inv.owner_email })}`);
  }
  if (user.email !== inv.email) {
    return <Message title="This invite is for someone else"
      body={`It was sent to ${inv.email}, but you're signed in as ${user.email}. Log out and sign in as ${inv.email} to accept it.`} />;
  }
  await acceptInvite(inv.id, user.id);
  redirect("/sites");
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 text-center shadow-card">
        <div className="flex justify-center"><Logo size={32} /></div>
        <h1 className="mt-5 text-[20px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
        <Link href="/sites" className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-[13.5px] font-medium text-on-accent hover:bg-accent-hover">Go to Pagewise</Link>
      </div>
    </main>
  );
}
