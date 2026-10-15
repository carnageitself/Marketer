import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { appOrigin, setupInfo, siteAccess } from "@/lib/sites";
import Setup from "@/components/Setup";
import { accountOf } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const access = await siteAccess(id, user);
  if (!access) notFound();
  const { site, role } = access;
  return <Setup email={user.email} role={role} account={await accountOf(user)} initial={JSON.parse(JSON.stringify(await setupInfo(site, appOrigin(await headers()))))} />;
}
