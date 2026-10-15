"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon, Logo } from "./icons";
import { Button, field } from "./ui";

const POINTS = [
  "See which sections of a page turn readers into customers",
  "Setup is automatic: we detect your DNS, host and platform",
  "No cookies, so no cookie banner",
];

export default function AuthForm({ initialMode }: { initialMode: "login" | "signup" }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: mode, email: f.get("email"), password: f.get("password"), name: f.get("name") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setBusy(false); return; }
    window.location.href = "/sites";
  }

  const input = `${field} h-11 w-full text-[14px]`;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line bg-panel lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-40 -top-40 h-130 w-130 rounded-full bg-accent/10 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2.5"><Logo size={28} /><span className="text-[16px] font-semibold tracking-tight">Pagewise</span></Link>
        <div className="relative max-w-md">
          <h2 className="text-[32px] font-semibold leading-tight tracking-tight">See which parts of your website make you money.</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map(p => (
              <li key={p} className="flex items-start gap-3 text-[14px] text-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="check" size={12} strokeWidth={3} /></span>{p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-faint">Works on WordPress, Shopify, Webflow, Wix, Squarespace, Next.js and plain HTML.</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <Link href="/" className="mb-10 flex items-center gap-2.5 lg:hidden"><Logo size={26} /><span className="text-[15px] font-semibold">Pagewise</span></Link>
          <h1 className="text-[24px] font-semibold tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">{mode === "signup" ? "Free while in beta. No card needed." : "Log in to your dashboard."}</p>
          <div className="mt-8 space-y-3">
            {mode === "signup" && <Labeled label="Name"><input name="name" placeholder="Your name" className={input} autoComplete="name" /></Labeled>}
            <Labeled label="Email"><input name="email" type="email" required placeholder="you@company.com" className={input} autoComplete="email" /></Labeled>
            <Labeled label="Password"><input name="password" type="password" required minLength={8} placeholder="8+ characters" className={input}
              autoComplete={mode === "signup" ? "new-password" : "current-password"} /></Labeled>
          </div>
          {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}
          <Button type="submit" size="lg" disabled={busy} className="mt-6 w-full">{busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}</Button>
          <p className="mt-6 text-center text-[13px] text-muted">
            {mode === "signup" ? "Already have an account?" : "New to Pagewise?"}{" "}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}>
              {mode === "signup" ? "Log in" : "Create an account"}
            </button>
          </p>
        </form>
      </div>
    </main>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12.5px] font-medium">{label}</span>{children}</label>;
}
