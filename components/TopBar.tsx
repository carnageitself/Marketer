"use client";
import Link from "next/link";
import type { ReactNode } from "react";

export default function TopBar({ email, children }: { email: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/sites" className="text-[14px] font-semibold">Pagewise</Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
        <span className="hidden text-[12px] text-muted sm:inline">{email}</span>
        <button className="text-[12px] text-muted hover:text-ink" onClick={async () => {
          await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
          window.location.href = "/";
        }}>Log out</button>
      </div>
    </header>
  );
}
