import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { accountOf } from "@/lib/billing";
import { one } from "@/lib/db";
import BillingView from "@/components/BillingView";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const billing = (await one<{ billing: Record<string, string> }>("select billing from users where id = $1", [user.id]))?.billing ?? {};
  return <BillingView email={user.email} account={await accountOf(user)} billing={{ status: billing.status, interval: billing.interval, periodEnd: billing.periodEnd }} />;
}
