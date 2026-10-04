import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import type { Severity, Trend } from "@/domain/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ───────────────────────────── Button ───────────────────────────────────────

type Variant = "primary" | "neon" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-110 border border-transparent",
  /** THE call to action of a screen: uppercase, glowing. One per view. */
  neon: "bg-accent text-accent-ink border border-transparent font-bold uppercase tracking-[0.1em] glow hover:brightness-110",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border border-transparent",
  outline: "bg-transparent text-ink border border-border-strong hover:border-accent/50 hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 border border-transparent",
  danger: "bg-bad-soft text-bad border border-transparent hover:opacity-90",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-10 px-3.5 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: ClassValue) {
  return cn("inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none min-w-[44px]", VARIANTS[variant], SIZES[size], extra);
}

/** Trailing arrow chip for neon CTAs ("START WORKOUT ›"). Put it last in the button and add `justify-between`. */
export function CtaArrow({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] bg-accent-ink/90 text-accent", className)}>
      <ChevronRight className="size-4 rtl:rotate-180" />
    </span>
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, href, children, ...props }: { variant?: Variant; size?: Size; className?: string; href: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

// ───────────────────────────── Badges & pills ───────────────────────────────

const TONE: Record<string, string> = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof TONE; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-4 tracking-wide", TONE[tone], className)}>{children}</span>;
}

export function severityTone(s: Severity): keyof typeof TONE {
  return s === "URGENT" ? "bad" : s === "ATTENTION" ? "warn" : s === "WATCH" ? "info" : "neutral";
}

export function statusTone(status: string): keyof typeof TONE {
  switch (status) {
    case "ACTIVE":
      return "good";
    case "TRIAL":
      return "info";
    case "ONBOARDING":
      return "accent";
    case "PAUSED":
      return "warn";
    case "CHURNED":
      return "bad";
    default:
      return "neutral";
  }
}

export function TrendIcon({ trend, className }: { trend: Trend; className?: string }) {
  const cls = cn("inline-block size-4", trend === "UP" ? "text-good" : trend === "DOWN" ? "text-bad" : "text-muted", className);
  if (trend === "UP") return <ArrowUpRight className={cls} aria-label="up" />;
  if (trend === "DOWN") return <ArrowDownRight className={cls} aria-label="down" />;
  return <Minus className={cls} aria-label="flat" />;
}

// ───────────────────────────── Avatar ───────────────────────────────────────

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const ini = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/10", className)} style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, hsl(${h} 38% 40%), hsl(${h} 42% 26%))` }}>
      {ini}
    </span>
  );
}

// ───────────────────────────── Surfaces ─────────────────────────────────────

export function Panel({ className, children, as: Tag = "section", ...props }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("rounded-lg border border-border bg-surface", className)} {...props}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, sub, action, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[12.5px] font-semibold uppercase leading-5 tracking-[0.12em] text-ink-2">{title}</h2>
        {sub ? <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] font-extrabold uppercase leading-8 text-ink sm:text-[36px] sm:leading-9">{title}</h1>
        {sub ? <p className="mt-1 text-[13px] text-muted">{sub}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Kpi({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" | "neutral"; href?: string }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  const body = (
    <>
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className={cn("t-metric mt-1", color)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted-2">{hint}</div> : null}
    </>
  );
  const cls = "block rounded-lg border border-border bg-surface px-3.5 py-3";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-border-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ───────────────────────────── Empty & skeleton ─────────────────────────────

export function EmptyState({ title, why, cta, icon, compact }: { title: string; why?: string; cta?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface/40 text-center", compact ? "px-4 py-6" : "px-6 py-10")}>
      {icon ? <div className="mb-2 text-muted-2">{icon}</div> : null}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {why ? <p className="mt-1 max-w-md text-[13px] text-muted">{why}</p> : null}
      {cta ? <div className="mt-3">{cta}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

// ───────────────────────────── Forms ────────────────────────────────────────

export const inputClass = "h-11 w-full rounded-md border border-border-strong bg-surface-2 px-3 text-[15px] text-ink placeholder:text-muted-2 focus-visible:border-accent";
export const textareaClass = "w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-[15px] text-ink placeholder:text-muted-2 focus-visible:border-accent min-h-[88px]";
export const selectClass = "h-11 w-full rounded-md border border-border-strong bg-surface-2 px-2.5 text-[15px] text-ink focus-visible:border-accent";

export function Field({ label, hint, children, required, className }: { label: string; hint?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[12.5px] font-medium text-ink-2">
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Scale({ name, value, labels, defaultValue }: { name: string; value?: number; defaultValue?: number; labels: string[] }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer">
          <input type="radio" name={name} value={n} defaultChecked={(value ?? defaultValue) === n} className="peer sr-only" />
          <span className="flex h-12 flex-col items-center justify-center rounded-md border border-border-strong bg-surface-2 font-display text-[17px] font-bold text-ink-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-checked:glow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
            {n}
            <span className="font-sans text-[10px] font-normal text-muted">{labels[n - 1]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ───────────────────────────── Misc ─────────────────────────────────────────

export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline", className)}>
      {children}
      <ArrowRight className="size-3.5 rtl:rotate-180" />
    </Link>
  );
}

export function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-[13px]", className)}>
      <span className="text-muted">{label}</span>
      <span className="tnum text-end font-medium text-ink">{value}</span>
    </div>
  );
}

export function Tabs({ items, current, base }: { items: { key: string; label: string; count?: number }[]; current: string; base: string }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="tabs">
      {items.map((it) => {
        const active = it.key === current;
        return (
          <Link
            key={it.key}
            href={`${base}${it.key === "overview" ? "" : `?tab=${it.key}`}`}
            className={cn("relative -mb-px inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[12.5px] font-semibold uppercase tracking-[0.08em]", active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink")}
            aria-current={active ? "page" : undefined}
          >
            {it.label}
            {it.count ? <span className={cn("tnum rounded-full px-1.5 text-[11px] tracking-normal", active ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted")}>{it.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
