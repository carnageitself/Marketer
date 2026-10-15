"use client";
// Shared building blocks for the dashboard and setup screens.
import { useState, type ReactNode } from "react";
import { Icon } from "./icons";

export const fmt = {
  n: (v: unknown) => (Number(v) || 0).toLocaleString("en-US"),
  pct: (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`),
  ms: (v: unknown) => {
    const s = Math.round((Number(v) || 0) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
  },
  ago: (iso: unknown) => {
    const d = Date.now() - new Date(String(iso)).getTime();
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return new Date(String(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  },
  rate: (a: unknown, b: unknown) => {
    const d = Number(b) || 0;
    return d ? `${Math.round((1000 * (Number(a) || 0)) / d) / 10}%` : "—";
  },
};

/** Shared input / select styling. */
export const field = "rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15";

export function Card({ title, subtitle, action, children, className = "", flush }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-semibold tracking-tight">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Delta({ value, invert }: { value: number | null | undefined; invert?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return null;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={`tabular inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ${good ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
      <Icon name={value > 0 ? "up" : "down"} size={11} strokeWidth={2.25} />{Math.abs(value)}%
    </span>
  );
}

export function Stat({ label, value, delta, hint, invert }: { label: string; value: ReactNode; delta?: number | null; hint?: string; invert?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5 shadow-card" title={hint}>
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="tabular text-[22px] font-semibold tracking-tight">{value}</span>
        <Delta value={delta} invert={invert} />
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", dot, children }: { tone?: "neutral" | "good" | "bad" | "accent" | "warn"; dot?: boolean; children: ReactNode }) {
  const cls = {
    neutral: "bg-panel-2 text-muted ring-line",
    good: "bg-good-soft text-good ring-good/20",
    bad: "bg-bad-soft text-bad ring-bad/20",
    accent: "bg-accent-soft text-accent ring-accent/20",
    warn: "bg-warn-soft text-warn ring-warn/20",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${cls}`}>
      {dot && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" /></span>}
      {children}
    </span>
  );
}

export function Button({ children, variant = "primary", size = "md", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "subtle"; size?: "sm" | "md" | "lg" }) {
  const cls = {
    primary: "bg-accent text-on-accent shadow-card hover:bg-accent-hover",
    ghost: "border border-line bg-panel text-ink shadow-card hover:border-line-strong hover:bg-panel-2",
    subtle: "text-muted hover:bg-panel-2 hover:text-ink",
    danger: "border border-line bg-panel text-bad shadow-card hover:border-bad/40 hover:bg-bad-soft",
  }[variant];
  const sz = { sm: "h-8 px-3 text-[12.5px]", md: "h-9 px-3.5 text-[13px]", lg: "h-11 px-5 text-[14px]" }[size];
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:pointer-events-none disabled:opacity-50 ${sz} ${cls} ${className}`}>
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" size="sm" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ }
    }}><Icon name={done ? "check" : "copy"} size={14} />{done ? "Copied" : label}</Button>
  );
}

export function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-panel-2 px-3.5 py-3 font-mono text-[12px] leading-relaxed">{children}</pre>;
}

/** Segmented control. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-0.5 overflow-x-auto rounded-lg border border-line bg-panel-2 p-0.5">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-medium transition ${value === t.id ? "bg-panel text-ink shadow-card" : "text-muted hover:text-ink"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal bar list: label on the bar, value(s) on the right (Plausible-style). */
export function BarList({ rows, columns, empty = "No data yet", onSelect }: {
  rows: { key: string; value: number; cells?: ReactNode[]; sub?: ReactNode }[];
  columns?: string[];
  empty?: string;
  onSelect?: (key: string) => void;
}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="space-y-1">
      {columns && (
        <div className="flex justify-end gap-4 px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
          {columns.map(c => <span key={c} className="w-16 text-right">{c}</span>)}
        </div>
      )}
      {rows.map(r => (
        <div key={r.key} className={`group flex items-center gap-4 ${onSelect ? "cursor-pointer" : ""}`} onClick={() => onSelect?.(r.key)}>
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
            <div className="absolute inset-y-0 left-0 rounded-md bg-bar transition-[width] duration-500 group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%` }} />
            <div className="relative truncate px-2.5 py-1.5 text-[13px]" title={r.key}>{r.key}{r.sub}</div>
          </div>
          {(r.cells ?? [fmt.n(r.value)]).map((c, i) => <span key={i} className={`tabular w-16 text-right text-[13px] ${i ? "text-muted" : "font-medium"}`}>{c}</span>)}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center px-4 py-8 text-center text-[13px] text-muted">{children}</div>;
}

/** Skeleton shown while a report loads. */
export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2.5 py-1" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-7 rounded-md bg-panel-2" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

export function Table({ head, rows, empty = "No data yet" }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-faint">
            {head.map((h, i) => <th key={h} className={`whitespace-nowrap px-5 pb-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line transition hover:bg-panel-2">
              {r.map((c, j) => <td key={j} className={`tabular px-5 py-2.5 ${j ? "whitespace-nowrap text-right" : "max-w-[480px] truncate"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
