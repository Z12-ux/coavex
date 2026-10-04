import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, cn } from "./ui";
import { RingGauge, Sparkline } from "./charts";

/**
 * Dashboard stat card: label · big number · delta chip · optional ring or
 * sparkline on the side. One idea per card, no legend needed.
 */
export function StatCard({ label, value, unit, delta, deltaLabel, ring, ringTone, spark, sparkGood, tone = "neutral", href, className, hint }: { label: string; value: ReactNode; unit?: string; /** signed number already formatted, e.g. "+2 pts" */ delta?: { text: string; good?: boolean | null } | null; deltaLabel?: string; ring?: number | null; ringTone?: "accent" | "good" | "warn" | "bad" | "info"; spark?: (number | null)[]; sparkGood?: "up" | "down"; tone?: "good" | "warn" | "bad" | "neutral"; href?: string; className?: string; hint?: string }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  const body = (
    <div className="flex h-full items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="t-caption truncate">{label}</div>
        <div className={cn("t-metric mt-1 flex items-baseline gap-1", color)}>
          {value}
          {unit ? <span className="text-[13px] font-medium text-muted">{unit}</span> : null}
        </div>
        {delta ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px]">
            <span className={cn("tnum rounded-full px-1.5 py-0.5 font-semibold", delta.good === true ? "bg-good-soft text-good" : delta.good === false ? "bg-bad-soft text-bad" : "bg-surface-2 text-ink-2")}>{delta.text}</span>
            {deltaLabel ? <span className="text-muted-2">{deltaLabel}</span> : null}
          </div>
        ) : hint ? (
          <div className="mt-1.5 text-[11.5px] text-muted-2">{hint}</div>
        ) : null}
      </div>
      {ring !== undefined ? (
        <RingGauge value={ring} size={48} stroke={5} tone={ringTone ?? "accent"} label={label}>
          <span className="tnum text-[11px] font-bold text-ink-2">{ring === null ? "–" : `${Math.round(ring * 100)}%`}</span>
        </RingGauge>
      ) : spark ? (
        <Sparkline values={spark} width={76} height={30} goodWhen={sparkGood} area className="mt-1 shrink-0" />
      ) : null}
    </div>
  );
  const cls = cn("block rounded-lg border border-border bg-surface px-3.5 py-3 shadow-[var(--shadow-sm)]", className);
  return href ? (
    <Link href={href} className={cn(cls, "press hover:border-border-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Dark gradient hero surface for the one thing to do now. */
export function HeroCard({ children, className, as: Tag = "section", ...props }: { children: ReactNode; className?: string; as?: "section" | "div" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("forge hero relative overflow-hidden rounded-lg p-4 sm:p-5", className)} {...props}>
      <span aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(120%_90%_at_100%_0%,black,transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute -end-20 -top-24 size-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative">{children}</div>
    </Tag>
  );
}

/** Avatar wrapped in a thin progress ring (goal progress, adherence…). */
export function AvatarRing({ name, size = 44, value, tone = "accent", className, label }: { name: string; size?: number; value: number | null; tone?: "accent" | "good" | "warn" | "bad" | "info"; className?: string; label?: string }) {
  return (
    <RingGauge value={value} size={size + 12} stroke={3} tone={tone} className={className} label={label}>
      <Avatar name={name} size={size} />
    </RingGauge>
  );
}
