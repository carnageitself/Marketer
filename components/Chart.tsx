"use client";
// Time-series area chart with a hover readout. Plain SVG, no chart library.
import { useEffect, useRef, useState } from "react";

export interface SeriesPoint { t: string; [k: string]: number | string }

export function AreaChart({ data, metric, label, bucket }: { data: SeriesPoint[]; metric: string; label: string; bucket: "hour" | "day" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = 220, padL = 36, padB = 24, padT = 12;
  const vals = data.map(d => Number(d[metric]) || 0);
  const max = Math.max(...vals, 1);
  const nice = max <= 5 ? 5 : Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const x = (i: number) => padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (w - padL - 8));
  const y = (v: number) => padT + (1 - v / nice) * (h - padT - padB);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(vals.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const tick = (iso: string) => {
    const d = new Date(iso);
    return bucket === "hour" ? d.toLocaleTimeString("en-US", { hour: "numeric" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 90))));

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg width={w} height={h} role="img" aria-label={`${label} over time`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - rect.left;
          const i = Math.round(((px - padL) / (w - padL - 8)) * (data.length - 1));
          setHover(Math.min(data.length - 1, Math.max(0, i)));
        }}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={w - 8} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--border)" strokeDasharray={f ? "3 3" : undefined} />
            <text x={padL - 6} y={y(nice * f) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{Math.round(nice * f)}</text>
          </g>
        ))}
        {data.map((d, i) => i % every === 0 && (
          <text key={d.t} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{tick(d.t)}</text>
        ))}
        <path d={area} fill="var(--accent)" opacity="0.12" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="var(--muted)" strokeDasharray="2 3" />
            <circle cx={x(hover)} cy={y(vals[hover])} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] shadow-sm"
          style={{ left: Math.min(Math.max(0, x(hover) - 60), w - 140) }}>
          <div className="text-muted">{bucket === "hour" ? new Date(data[hover].t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }) : tick(data[hover].t)}</div>
          <div className="tabular font-semibold">{vals[hover].toLocaleString("en-US")} {label.toLowerCase()}</div>
        </div>
      )}
    </div>
  );
}
