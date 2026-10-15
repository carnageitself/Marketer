import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { siteAccess } from "@/lib/sites";
import Dashboard from "@/components/Dashboard";
import { accountOf } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function SiteDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const access = await siteAccess(id, user);
  if (!access) notFound();
  const { site, role } = access;
  return <Dashboard email={user.email} role={role} account={await accountOf(user)} site={JSON.parse(JSON.stringify(site))} initialTab={(await searchParams).tab} />;
}
