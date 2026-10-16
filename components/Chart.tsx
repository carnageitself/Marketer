"use client";
// Time-series area chart with a hover readout. Plain SVG, no chart library.
import { useEffect, useId, useRef, useState } from "react";

export interface SeriesPoint { t: string; [k: string]: number | string }

export function AreaChart({ data, metric, label, bucket, height = 220, format }: { data: SeriesPoint[]; metric: string; label: string; bucket: "hour" | "day"; height?: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const grad = useId().replace(/:/g, "");
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = height, padL = 40, padR = 12, padB = 26, padT = 14;
  const vals = data.map(d => Number(d[metric]) || 0);
  const max = Math.max(...vals, 1);
  const nice = max <= 5 ? 5 : Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const x = (i: number) => padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (w - padL - padR));
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
          const i = Math.round(((px - padL) / (w - padL - padR)) * (data.length - 1));
          setHover(Math.min(data.length - 1, Math.max(0, i)));
        }}>
        <defs>
          <linearGradient id={grad} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={w - padR} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--border)" strokeDasharray={f ? "3 4" : undefined} />
            <text x={padL - 8} y={y(nice * f) + 4} textAnchor="end" fontSize="10.5" fill="var(--faint)" className="tabular">{format ? format(Math.round(nice * f)) : Math.round(nice * f).toLocaleString("en-US")}</text>
          </g>
        ))}
        {data.map((d, i) => i % every === 0 && (
          <text key={d.t} x={x(i)} y={h - 7} textAnchor={x(i) > w - padR - 30 ? "end" : x(i) < padL + 20 ? "start" : "middle"} fontSize="10.5" fill="var(--faint)">{tick(d.t)}</text>
        ))}
        <path d={area} fill={`url(#${grad})`} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="var(--border-strong)" />
            <circle cx={x(hover)} cy={y(vals[hover])} r="4.5" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-panel px-3 py-2 text-[12px] shadow-pop"
          style={{ left: Math.min(Math.max(0, x(hover) - 70), w - 160) }}>
          <div className="text-muted">{bucket === "hour" ? new Date(data[hover].t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }) : tick(data[hover].t)}</div>
          <div className="tabular mt-0.5 font-semibold">{format ? `${format(vals[hover])} ${label.toLowerCase()}` : `${vals[hover].toLocaleString("en-US")} ${label.toLowerCase()}`}</div>
        </div>
      )}
    </div>
  );
}
