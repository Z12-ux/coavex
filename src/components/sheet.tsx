"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { isLocale, t } from "@/lib/i18n/dictionary";

/**
 * Bottom sheet on phones, centered dialog from 640px. Native <dialog> keeps
 * focus trapping, Escape and backdrop behaviour for free.
 */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // No locale prop: follow the language the root layout rendered (French until mounted).
  const [closeLabel, setCloseLabel] = useState(() => t("fr", "common.close"));
  useEffect(() => {
    const lang = document.documentElement.lang;
    if (isLocale(lang)) setCloseLabel(t(lang, "common.close"));
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
        {title ? (
          <header className="flex shrink-0 items-center gap-2.5 pb-2 pe-2 ps-4 pt-2 sm:pt-3">
            <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-accent" />
            <h2 className="min-w-0 flex-1 font-display text-[21px] font-bold uppercase leading-6 tracking-[0.04em] text-ink">{title}</h2>
            <button type="button" onClick={onClose} className="press grid size-11 shrink-0 place-items-center rounded-md border border-border text-muted hover:border-border-strong hover:bg-surface-2 hover:text-ink" aria-label={closeLabel} title={closeLabel}>
              <X className="size-5" />
            </button>
          </header>
        ) : null}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">{children}</div>
        {/* explicit bottom padding: the unlayered `.safe-b` helper would override `py-3` and glue the content to the edge */}
        {footer ? <footer className="shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
