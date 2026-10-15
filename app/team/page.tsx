import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { accountOf } from "@/lib/billing";
import TeamView from "@/components/TeamView";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/team");
  return <TeamView email={user.email} userId={user.id} account={await accountOf(user)} />;
}
