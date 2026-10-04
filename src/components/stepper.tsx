"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "./ui";

/**
 * Touch-first numeric input (Forge): dark inset, condensed numerals, big −/+
 * targets (48 px tall; 36 px wide under `sm` so a kg value like 81.25 stays
 * readable in a phone set row, 44 px from `sm`), direct typing still possible.
 * Focus is shown on the whole control (lime border) rather than on the input.
 */
export function Stepper({ value, onChange, step = 1, min = 0, max = 999, label, unit, className, size = "md", inputMode = "decimal" }: { value: number | ""; onChange: (v: number | "") => void; step?: number; min?: number; max?: number; label: string; unit?: string; className?: string; size?: "md" | "lg"; inputMode?: "numeric" | "decimal" }) {
  const n = value === "" ? null : value;
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  const h = size === "lg" ? "h-14" : "h-12";
  const btn = "press grid w-9 shrink-0 place-items-center text-ink-2 hover:bg-surface-3 hover:text-ink active:bg-surface-3 disabled:opacity-35 disabled:hover:bg-transparent sm:w-11";
  return (
    <div
      className={cn(
        "flex items-stretch rounded-md border border-border-strong bg-surface-2 transition-colors has-[input:focus]:border-accent has-[input:focus]:shadow-[0_0_0_1px_var(--accent)]",
        h,
        className,
      )}
      role="group"
      aria-label={label}
    >
      <button type="button" onClick={() => set((n ?? 0) - step)} disabled={n !== null && n <= min} className={cn(btn, "rounded-s-[11px]")} aria-label={`${label} −${step}`}>
        <Minus className="size-4" />
      </button>
      <div className="relative min-w-0 flex-1 border-x border-border">
        <input
          type="number"
          inputMode={inputMode}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          className="tnum h-full w-full min-w-0 bg-transparent px-0.5 text-center font-display text-[17px] font-bold text-ink sm:text-[19px]"
          style={{ outline: "none" }}
          aria-label={label}
        />
        {unit ? <span className="pointer-events-none absolute inset-y-0 end-1.5 flex items-center text-[11px] text-muted-2">{unit}</span> : null}
      </div>
      <button type="button" onClick={() => set((n ?? 0) + step)} disabled={n !== null && n >= max} className={cn(btn, "rounded-e-[11px]")} aria-label={`${label} +${step}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}
