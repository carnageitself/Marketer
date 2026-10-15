import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { loginProviders } from "@/lib/oauth-login";
import AuthForm from "@/components/AuthForm";

type Params = { mode?: string; next?: string; email?: string; invite?: string; error?: string };

/** Same-site relative paths only. */
const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/sites");

export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next);
  return <AuthForm initialMode={sp.mode === "signup" ? "signup" : "login"} next={next} email={sp.email ?? ""} invite={sp.invite} initialError={sp.error ?? ""} providers={loginProviders()} />;
}
