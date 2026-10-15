import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  if (await currentUser()) redirect("/sites");
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
      <div className="text-[13px] font-semibold text-accent">Pagewise</div>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        See which parts of your website make you money, and what to fix next.
      </h1>
      <p className="mt-5 max-w-xl text-[15px] text-muted">
        One script tag on any site (WordPress, Shopify, Webflow, Next.js, plain HTML). We detect your DNS and platform,
        set things up for you, and show how far people read, what they click, and which sections turn visitors into customers.
        No cookies, no banner needed.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login?mode=signup" className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-on-accent">Get started free</Link>
        <Link href="/login" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-[14px] font-medium">Log in</Link>
      </div>
    </main>
  );
}
