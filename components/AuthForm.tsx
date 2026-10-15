"use client";
import { useState } from "react";
import { Button } from "./ui";

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

  const input = "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[14px] outline-none focus:border-accent";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-panel p-6">
        <div className="text-[13px] font-semibold text-accent">Pagewise</div>
        <h1 className="text-xl font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        {mode === "signup" && <input name="name" placeholder="Your name" className={input} autoComplete="name" />}
        <input name="email" type="email" required placeholder="you@company.com" className={input} autoComplete="email" />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className={input}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        {error && <p className="text-[13px] text-bad">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full py-2.5">{busy ? "…" : mode === "signup" ? "Create account" : "Log in"}</Button>
        <p className="text-center text-[13px] text-muted">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button type="button" className="text-accent" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}>
            {mode === "signup" ? "Log in" : "Create an account"}
          </button>
        </p>
      </form>
    </main>
  );
}
