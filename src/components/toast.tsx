"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X, OctagonAlert } from "lucide-react";
import { isLocale, t } from "@/lib/i18n/dictionary";
import { cn } from "./ui";

export type ToastTone = "good" | "bad" | "warn" | "info";
export interface ToastDetail {
  message: string;
  tone?: ToastTone;
  duration?: number;
}

/** Fire a toast from any client code. Server-rendered forms use ActionForm's `toast` prop. */
export function toast(message: string, tone: ToastTone = "good", duration = 2600) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("coachos:toast", { detail: { message, tone, duration } }));
}

interface Item extends ToastDetail {
  id: number;
}

// Semantic start edge + icon; the body stays ink on a dark surface (Forge snackbar, dark in both themes).
const TONES: Record<ToastTone, { edge: string; text: string; Icon: typeof CheckCircle2 }> = {
  good: { edge: "bg-good", text: "text-good", Icon: CheckCircle2 },
  bad: { edge: "bg-bad", text: "text-bad", Icon: OctagonAlert },
  warn: { edge: "bg-warn", text: "text-warn", Icon: AlertTriangle },
  info: { edge: "bg-info", text: "text-info", Icon: Info },
};

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  // No locale prop: follow the language the root layout rendered.
  const [closeLabel, setCloseLabel] = useState(() => t("fr", "common.close"));
  useEffect(() => {
    const lang = document.documentElement.lang;
    if (isLocale(lang)) setCloseLabel(t(lang, "common.close"));
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { id, ...d }]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.duration ?? 2600);
    };
    window.addEventListener("coachos:toast", onToast);
    return () => window.removeEventListener("coachos:toast", onToast);
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pe-6" role="status" aria-live="polite">
      {items.map((it) => {
        const tone = TONES[it.tone ?? "good"] ?? TONES.good;
        return (
          <div
            key={it.id}
            className="forge pointer-events-auto relative flex min-h-12 w-full max-w-sm items-center gap-2.5 overflow-hidden rounded-md border border-border-strong bg-surface-2 py-0.5 pe-0.5 ps-4 text-[13.5px] shadow-[var(--shadow)]"
            style={{ animation: "toast-in var(--t-med) var(--ease-out) both" }}
          >
            <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", tone.edge)} />
            <tone.Icon className={cn("size-[18px] shrink-0", tone.text)} aria-hidden />
            <span className="min-w-0 flex-1 py-1.5 font-medium leading-5 text-ink">{it.message}</span>
            <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} className="grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-ink" aria-label={closeLabel}>
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
