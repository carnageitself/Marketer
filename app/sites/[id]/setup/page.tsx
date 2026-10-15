import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { appOrigin, getSite, setupInfo } from "@/lib/sites";
import Setup from "@/components/Setup";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const site = await getSite(id);
  if (!site || site.user_id !== user.id) notFound();
  return <Setup email={user.email} initial={JSON.parse(JSON.stringify(await setupInfo(site, appOrigin(await headers()))))} />;
}
