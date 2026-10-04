"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ClipboardList, Dumbbell, MessageSquare, StickyNote } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { rememberClient } from "@/components/command-palette";
import { toast } from "@/components/toast";
import { CtaArrow, buttonClass, cn } from "@/components/ui";

/**
 * Contextual actions for a client profile (Message · Check-in · Note + the
 * neon "Séance" CTA). `inline` sits in the desktop header; `bar` is pinned
 * above the bottom nav on phones. Both are mounted (CSS picks one), so only the
 * bar remembers the client for the palette and fires the "session logged" toast.
 */
export function ProfileActions({ clientId, clientName, locale, nextSessionId, doneMessage, prMessage, variant = "bar" }: { clientId: string; clientName: string; locale: Locale; nextSessionId: string | null; doneMessage?: string; prMessage?: string; variant?: "bar" | "inline" }) {
  const announce = variant === "bar";
  useEffect(() => {
    if (announce) rememberClient(clientId, clientName);
  }, [announce, clientId, clientName]);
  useEffect(() => {
    if (announce && doneMessage) toast(`${t(locale, "client.sessionDone")} · ${doneMessage}${prMessage ? ` · 🏆 ${prMessage}` : ""}`, "good", 4000);
  }, [announce, doneMessage, prMessage, locale]);

  const sessionHref = nextSessionId ? `/clients/${clientId}/train/${nextSessionId}` : `/clients/${clientId}?tab=training`;
  const sessionLabel = t(locale, "client.actions.session");
  const secondary = [
    { href: `/messages/${clientId}`, icon: MessageSquare, label: t(locale, "client.actions.message") },
    { href: `/clients/${clientId}?tab=checkins`, icon: ClipboardList, label: t(locale, "client.actions.checkin") },
    { href: `/clients/${clientId}?tab=notes`, icon: StickyNote, label: t(locale, "client.actions.note") },
  ];

  if (variant === "inline") {
    // Below xl the header is narrow (sidebar + card padding): the secondary actions go icon-only so the name keeps its room.
    return (
      <div className="flex items-center gap-2">
        {secondary.map((it) => (
          <Link key={it.href} href={it.href} className={buttonClass("outline", "md", "press px-0 xl:px-3.5")} aria-label={it.label} title={it.label}>
            <it.icon className="size-4" />
            <span className="hidden xl:inline">{it.label}</span>
          </Link>
        ))}
        <Link href={sessionHref} className={buttonClass("neon", "md", "press justify-between gap-3 pe-1 ps-4")}>
          <span className="flex items-center gap-2">
            <Dumbbell className="size-4" />
            {sessionLabel}
          </span>
          <CtaArrow />
        </Link>
      </div>
    );
  }

  // Phone bar: sits right on top of the bottom nav (64 px items + 1 px border); the end padding keeps every target clear of the quick-actions FAB (end-4, 56 px).
  return (
    <div className="fixed inset-x-0 bottom-[calc(65px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 py-1.5 ps-2 pe-[80px] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1">
        <Link href={sessionHref} className={buttonClass("neon", "lg", "press h-12 min-w-0 flex-1 justify-between gap-2 pe-2 ps-4 text-[13.5px]")}>
          <span className="truncate">{sessionLabel}</span>
          <CtaArrow />
        </Link>
        {secondary.map((it) => (
          <Link key={it.href} href={it.href} className={cn("press flex h-12 w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-[10.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <it.icon className="size-5" />
            <span className="max-w-full truncate">{it.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
