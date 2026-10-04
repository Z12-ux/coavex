"use client";

import Link from "next/link";
import { useState, type ComponentType } from "react";
import { Plus, Search, UserPlus, MessageSquare, CalendarDays, ClipboardCheck, Dumbbell, Activity, StickyNote, ClipboardList, ChevronRight } from "lucide-react";
import { Sheet } from "./sheet";
import { cn } from "./ui";

export type QuickAction = { key: string; label: string; hint?: string; href?: string; event?: string; icon: "search" | "client" | "message" | "agenda" | "review" | "workout" | "measure" | "note" | "checkin" };

const ICONS: Record<QuickAction["icon"], ComponentType<{ className?: string }>> = { search: Search, client: UserPlus, message: MessageSquare, agenda: CalendarDays, review: ClipboardCheck, workout: Dumbbell, measure: Activity, note: StickyNote, checkin: ClipboardList };

/** Floating neon "+" on phones that opens a sheet of contextual actions. */
export function QuickActionsFab({ actions, title }: { actions: QuickAction[]; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press glow fixed bottom-[calc(80px+env(safe-area-inset-bottom))] end-4 z-40 grid size-14 place-items-center rounded-full bg-accent text-accent-ink hover:brightness-110 lg:hidden" aria-label={title}>
        <Plus className="size-7" strokeWidth={2.5} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={<span className="font-display text-[20px] font-bold uppercase tracking-[0.04em]">{title}</span>}>
        <QuickActionList actions={actions} onPick={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function QuickActionList({ actions, onPick, columns = 2 }: { actions: QuickAction[]; onPick?: () => void; columns?: 1 | 2 }) {
  return (
    <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {actions.map((a) => {
        const Icon = ICONS[a.icon];
        const inner = (
          <>
            <span className="grid size-10 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent-soft text-accent">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold leading-[18px] text-ink">{a.label}</span>
              {a.hint ? <span className="t-caption block truncate">{a.hint}</span> : null}
            </span>
            {columns === 1 ? <ChevronRight className="size-4 shrink-0 text-muted-2 rtl:rotate-180" /> : null}
          </>
        );
        const cls = "press flex min-h-[64px] items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-start hover:border-accent/40 hover:bg-surface-3";
        if (a.href)
          return (
            <Link key={a.key} href={a.href} className={cls} onClick={onPick}>
              {inner}
            </Link>
          );
        return (
          <button
            key={a.key}
            type="button"
            className={cls}
            onClick={() => {
              onPick?.();
              if (a.event) window.dispatchEvent(new Event(a.event));
            }}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
