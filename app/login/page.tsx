import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await currentUser()) redirect("/sites");
  const { mode } = await searchParams;
  return <AuthForm initialMode={mode === "signup" ? "signup" : "login"} />;
}
