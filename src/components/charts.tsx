/**
 * Small, dependency-free SVG charts. All single-series (no legend needed);
 * thin 2px lines, ≥8px end marker, native <title> tooltips, text in ink tokens.
 */

import { useId, type ReactNode } from "react";
import { cn } from "./ui";

const TONES: Record<string, string> = { accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--info)", ink: "var(--ink)", muted: "var(--muted)" };

export function Sparkline({ values, labels, width = 160, height = 40, className, unit = "", goodWhen, area = false, stroke = 2 }: { values: (number | null)[]; labels?: string[]; width?: number; height?: number; className?: string; unit?: string; goodWhen?: "down" | "up"; /** soft gradient fill under the line */ area?: boolean; stroke?: number }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <div className={cn("text-[12px] text-muted-2", className)} style={{ width, height }} />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  const delta = last.v - first.v;
  const tone = goodWhen ? ((goodWhen === "down" && delta < 0) || (goodWhen === "up" && delta > 0) ? "var(--good)" : delta === 0 ? "var(--muted)" : "var(--warn)") : "var(--accent)";
  const areaD = `${d} L${x(last.i).toFixed(1)},${height} L${x(first.i).toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)} role="img" aria-label={`${pts.length} values, ${first.v}${unit} → ${last.v}${unit}`}>
      {area ? (
        <>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={tone} stopOpacity={0.28} />
              <stop offset="1" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#g${gid})`} stroke="none" />
        </>
      ) : null}
      <path d={d} fill="none" stroke={tone} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={5} fill="transparent" stroke="none">
          <title>{`${labels?.[p.i] ?? ""} ${p.v}${unit}`.trim()}</title>
        </circle>
      ))}
      <circle cx={x(last.i)} cy={y(last.v)} r={4} fill={tone} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

/** Weekly completion strip: one thin bar per week, height = rate. */
export function BarStrip({ items, width = 160, height = 36, className }: { items: { label: string; value: number | null; hint?: string }[]; width?: number; height?: number; className?: string }) {
  const n = items.length;
  if (!n) return null;
  const gap = 2;
  const bw = (width - gap * (n - 1)) / n;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="weekly completion">
      {items.map((it, i) => {
        const h = it.value === null ? 2 : Math.max(2, it.value * (height - 2));
        const fill = it.value === null ? "var(--border)" : it.value >= 0.75 ? "var(--accent)" : it.value >= 0.5 ? "var(--warn)" : "var(--bad)";
        return (
          <g key={i}>
            <rect x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={2} fill={fill}>
              <title>{`${it.label}: ${it.value === null ? "–" : Math.round(it.value * 100) + "%"}${it.hint ? ` · ${it.hint}` : ""}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal score bar 0–100 with the value printed in ink. */
export function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score ?? undefined}>
        {score !== null ? <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} /> : null}
      </div>
      <span className="tnum w-8 text-end text-[12px] font-medium text-ink-2">{score === null ? "–" : score}</span>
    </div>
  );
}

/** Simple vertical bars with axis labels for small dashboards (single series). */
export function Bars({ items, height = 120, className, unit = "" }: { items: { label: string; value: number }[]; height?: number; className?: string; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={cn("flex items-end gap-1.5", className)} style={{ height }}>
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${it.label}: ${it.value}${unit}`}>
          <div className="w-full rounded-t-[3px] bg-accent" style={{ height: `${Math.max(2, (it.value / max) * (height - 22))}px` }} />
          <div className="w-full truncate text-center text-[10.5px] text-muted">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Circular progress (0..1) with a centre slot for the number. `null` draws the
 * track only. Animates once on mount (`.ring-fill`), respects reduced motion.
 */
export function RingGauge({ value, size = 56, stroke = 6, tone = "accent", color, track = "var(--surface-3)", className, children, label, glow = true }: { value: number | null; size?: number; stroke?: number; tone?: keyof typeof TONES; color?: string; track?: string; className?: string; children?: ReactNode; label?: string; /** neon halo on the arc (dark theme only) */ glow?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(v * 100)} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {value !== null ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? TONES[tone]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className={cn("ring-fill", glow && v > 0 && "ring-glow")} style={{ ["--ring-c" as string]: c, color: color ?? TONES[tone] }} /> : null}
      </svg>
      <div className="relative text-center leading-none">{children}</div>
    </div>
  );
}

export type DayState = "done" | "missed" | "planned" | "none";

/** Seven-day strip: one cell per day with the session state; today is ringed. */
export function DayStrip({ days, className, size = "md" }: { days: { key: string; label: string; state: DayState; today?: boolean; title?: string }[]; className?: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-6 text-[10.5px]" : "size-9 text-[12px]";
  return (
    <ol className={cn("grid grid-cols-7 gap-1", className)} aria-label="week">
      {days.map((d) => (
        <li key={d.key} className="flex flex-col items-center gap-1" title={d.title}>
          <span className={cn("text-[10.5px] font-medium uppercase", d.today ? "text-accent" : "text-muted-2")}>{d.label}</span>
          <span
            className={cn(
              "grid place-items-center rounded-full font-semibold",
              dim,
              d.state === "done" && "bg-accent text-accent-ink glow-sm",
              d.state === "missed" && "bg-bad-soft text-bad",
              d.state === "planned" && "border-2 border-dashed border-accent text-accent",
              d.state === "none" && "bg-surface-3 text-muted-2",
              d.today && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
            )}
          >
            {d.state === "done" ? "✓" : d.state === "missed" ? "✕" : d.state === "planned" ? "·" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
