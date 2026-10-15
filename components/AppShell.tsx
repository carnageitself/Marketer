"use client";
// App frame for every signed-in screen: sidebar navigation (a drawer on small
// screens) and a full-width content area.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon, Logo, type IconName } from "./icons";

export type NavId = "sites" | "overview" | "sources" | "pages" | "sections" | "visitors" | "settings" | "setup";

const SITE_NAV: { id: NavId; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "sources", label: "Sources", icon: "sources" },
  { id: "pages", label: "Pages", icon: "pages" },
  { id: "sections", label: "Sections", icon: "sections" },
  { id: "visitors", label: "Visitors", icon: "visitors" },
];

export default function AppShell({ email, site, active, onNav, children }: {
  email: string;
  site?: { id: string; domain: string; installed_at?: string | null };
  active: NavId;
  /** On the dashboard, switches tabs in place instead of navigating. */
  onNav?: (id: NavId) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const item = (id: NavId, label: string, icon: IconName, href: string) => (
    <Link key={id} href={href} onClick={e => {
      setOpen(false);
      if (onNav && id !== "setup" && id !== "sites") { e.preventDefault(); onNav(id); }
    }}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition ${active === id ? "bg-panel-2 text-ink" : "text-muted hover:bg-panel-2/60 hover:text-ink"}`}>
      <Icon name={icon} size={16} className={active === id ? "text-accent" : ""} />{label}
    </Link>
  );

  const nav = (
    <div className="flex h-full flex-col">
      <Link href="/sites" className="flex items-center gap-2.5 px-2 pb-5 pt-1">
        <Logo size={26} />
        <span className="text-[15px] font-semibold tracking-tight">Pagewise</span>
      </Link>

      {item("sites", "All websites", "sites", "/sites")}

      {site && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 shadow-card">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-[12px] font-semibold uppercase text-accent">{site.domain[0]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{site.domain}</div>
              <div className="flex items-center gap-1 text-[11px] text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${site.installed_at ? "bg-good" : "bg-bad"}`} />
                {site.installed_at ? "Receiving data" : "Not installed"}
              </div>
            </div>
          </div>
          <div className="px-2.5 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wider text-faint">Analytics</div>
          <div className="space-y-0.5">
            {SITE_NAV.map(n => item(n.id, n.label, n.icon, `/sites/${site.id}?tab=${n.id}`))}
          </div>
          <div className="px-2.5 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-wider text-faint">Configure</div>
          <div className="space-y-0.5">
            {item("setup", "Setup & install", "setup", `/sites/${site.id}/setup`)}
            {item("settings", "Goals & settings", "settings", `/sites/${site.id}?tab=settings`)}
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-line pt-3">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-3 text-[12px] font-semibold uppercase">{email[0]}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted" title={email}>{email}</span>
          <button title="Log out" className="rounded-md p-1.5 text-muted transition hover:bg-panel-2 hover:text-ink" onClick={async () => {
            await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
            window.location.href = "/";
          }}><Icon name="logout" size={15} /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-bg px-3 py-4 lg:block">{nav}</aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-panel/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-1 text-muted hover:text-ink" aria-label="Open menu"><Icon name="menu" size={20} /></button>
        <Logo size={22} />
        <span className="truncate text-[14px] font-semibold">{site?.domain ?? "Pagewise"}</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-bg px-3 py-4 shadow-pop">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-md p-1 text-muted hover:text-ink" aria-label="Close menu"><Icon name="close" size={18} /></button>
            {nav}
          </aside>
        </div>
      )}

      <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
