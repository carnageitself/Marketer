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

export default function AuthForm({ initialMode, next = "/sites", email = "", invite, initialError = "", providers }: {
  initialMode: "login" | "signup"; next?: string; email?: string; invite?: string; initialError?: string;
  providers: { google: boolean; microsoft: boolean };
}) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState(initialError);
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
    window.location.assign(next);
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
          <p className="mt-1.5 text-[13.5px] text-muted">
            {invite ? <>Join <b className="text-ink">{invite}</b>&apos;s team on Pagewise.</> : mode === "signup" ? "Free plan, no card needed." : "Log in to your dashboard."}
          </p>
          {(providers.google || providers.microsoft) && (
            <div className="mt-8 space-y-2.5">
              {providers.google && <SsoButton href={`/api/auth/oauth/start?provider=google&next=${encodeURIComponent(next)}`} label="Continue with Google" logo={<GoogleLogo />} />}
              {providers.microsoft && <SsoButton href={`/api/auth/oauth/start?provider=microsoft&next=${encodeURIComponent(next)}`} label="Continue with Microsoft" logo={<MicrosoftLogo />} />}
              <div className="flex items-center gap-3 pt-3 text-[12px] text-faint"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
            </div>
          )}
          <div className={`${providers.google || providers.microsoft ? "mt-3" : "mt-8"} space-y-3`}>
            {mode === "signup" && <Labeled label="Name"><input name="name" placeholder="Your name" className={input} autoComplete="name" /></Labeled>}
            <Labeled label="Email"><input name="email" type="email" required defaultValue={email} placeholder="you@company.com" className={input} autoComplete="email" /></Labeled>
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

function SsoButton({ href, label, logo }: { href: string; label: string; logo: React.ReactNode }) {
  return (
    <a href={href} className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-line bg-panel text-[14px] font-medium shadow-card transition hover:border-line-strong hover:bg-panel-2">
      {logo}{label}
    </a>
  );
}

// Brand marks as the providers' sign-in guidelines require (multicolour G, four-square Microsoft logo).
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12.5px] font-medium">{label}</span>{children}</label>;
}
