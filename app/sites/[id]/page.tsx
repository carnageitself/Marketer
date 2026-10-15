import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSite } from "@/lib/sites";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function SiteDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const site = await getSite(id);
  if (!site || site.user_id !== user.id) notFound();
  return <Dashboard email={user.email} site={JSON.parse(JSON.stringify(site))} initialTab={(await searchParams).tab} />;
}
