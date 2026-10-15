"use client";
// Shared building blocks for the dashboard and setup screens.
import { useState, type ReactNode } from "react";

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

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, delta, hint, invert }: { label: string; value: ReactNode; delta?: number | null; hint?: string; invert?: boolean }) {
  const good = delta !== null && delta !== undefined && (invert ? delta < 0 : delta > 0);
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3" title={hint}>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-[22px] font-semibold tracking-tight">{value}</span>
        {delta !== null && delta !== undefined && Number.isFinite(delta) && delta !== 0 && (
          <span className={`tabular text-[12px] font-medium ${good ? "text-good" : "text-bad"}`}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "accent"; children: ReactNode }) {
  const cls = {
    neutral: "bg-panel-2 text-muted",
    good: "bg-good-soft text-good",
    bad: "bg-bad-soft text-bad",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const cls = {
    primary: "bg-accent text-on-accent hover:opacity-90",
    ghost: "border border-line bg-panel hover:bg-panel-2",
    danger: "border border-line bg-panel text-bad hover:bg-bad-soft",
  }[variant];
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-50 ${cls} ${className}`}>
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ }
    }}>{done ? "Copied ✓" : label}</Button>
  );
}

export function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-panel-2 p-3 font-mono text-[12px]">{children}</pre>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium ${value === t.id ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}>
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
        <div className="flex justify-end gap-4 px-1 pb-1 text-[11px] uppercase tracking-wide text-muted">
          {columns.map(c => <span key={c} className="w-16 text-right">{c}</span>)}
        </div>
      )}
      {rows.map(r => (
        <div key={r.key} className={`flex items-center gap-4 ${onSelect ? "cursor-pointer" : ""}`} onClick={() => onSelect?.(r.key)}>
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
            <div className="absolute inset-y-0 left-0 rounded-md bg-bar" style={{ width: `${(r.value / max) * 100}%` }} />
            <div className="relative truncate px-2 py-1.5 text-[13px]" title={r.key}>{r.key}{r.sub}</div>
          </div>
          {(r.cells ?? [fmt.n(r.value)]).map((c, i) => <span key={i} className="tabular w-16 text-right text-[13px]">{c}</span>)}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-[13px] text-muted">{children}</div>;
}

export function Table({ head, rows, empty = "No data yet" }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={h} className={`px-2 py-2 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => <td key={j} className={`tabular px-2 py-2 ${j ? "text-right" : "max-w-[360px] truncate"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
