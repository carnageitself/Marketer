import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listSites } from "@/lib/sites";
import SitesList from "@/components/SitesList";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const sites = await listSites(user.id);
  return <SitesList email={user.email} initial={JSON.parse(JSON.stringify(sites))} />;
}
