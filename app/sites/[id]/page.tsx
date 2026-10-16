import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { demoSiteOf, siteAccess } from "@/lib/sites";
import Dashboard from "@/components/Dashboard";
import { accountOf } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function SiteDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; view?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const access = await siteAccess(id, user);
  // Demo companion sites are only ever shown through their real site's "Demo data" view.
  if (!access || access.site.demo_of) notFound();
  const { site, role } = access;
  const sp = await searchParams;
  const demo = await demoSiteOf(site, false);
  return <Dashboard email={user.email} role={role} account={await accountOf(user)} site={JSON.parse(JSON.stringify(site))}
    initialTab={sp.tab} demoId={demo?.id ?? null} initialView={sp.view === "demo" && demo ? "demo" : "real"} />;
}
