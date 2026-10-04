"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LogOut, MessageSquare, Route, TrendingUp } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { cn } from "./ui";
import { Toaster } from "./toast";
import { BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/app", key: "nav.today", icon: Home },
  { href: "/app/progress", key: "nav.progress", icon: TrendingUp },
  { href: "/app/journey", key: "nav.journey", icon: Route },
  { href: "/app/messages", key: "nav.messages", icon: MessageSquare },
] as const;

/**
 * Athlete app frame (phone-first, "Forge"): brand + who/coach, theme and
 * logout on top; four-tab bottom bar with the active tab in lime and a small
 * glowing indicator. The header stays h-14: workout mode sticks under it.
 */
export function ClientShell({ locale, firstName, coachName, unread, children, logout }: { locale: Locale; firstName: string; coachName: string; unread: number; children: React.ReactNode; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const immersive = pathname.startsWith("/app/workout/");
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <Toaster />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md">
        <BrandMark size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[17px] font-bold uppercase leading-5 tracking-[0.04em] text-ink">{firstName}</div>
          <div className="truncate text-[12px] leading-4 text-muted">
            {t(locale, "client.coachLabel")} {coachName}
          </div>
        </div>
        <ThemeToggle labels={{ toLight: t(locale, "theme.toLight"), toDark: t(locale, "theme.toDark") }} className="h-11 w-11" />
        <form action={logout}>
          <button type="submit" className="press grid size-11 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label={t(locale, "nav.logout")} title={t(locale, "nav.logout")}>
            <LogOut className="size-4 rtl:-scale-x-100" />
          </button>
        </form>
      </header>
      <main className={cn("flex-1 px-4", immersive ? "pt-4 pb-4" : "pt-5 pb-28")}>{children}</main>
      {!immersive ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md" aria-label="client">
          {NAV.map((n) => {
            const active = n.href === "/app" ? pathname === "/app" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn("press relative flex h-[60px] flex-col items-center justify-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]", active ? "text-accent" : "text-muted hover:text-ink-2")}
                aria-current={active ? "page" : undefined}
              >
                {active ? <span aria-hidden className="absolute inset-x-[34%] top-0 h-[3px] rounded-b-full bg-accent glow-sm" /> : null}
                <span className="relative">
                  <n.icon className={cn("size-[22px]", active && "ring-glow")} strokeWidth={active ? 2.3 : 1.9} />
                  {n.href === "/app/messages" && unread ? (
                    <span className="tnum absolute -end-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-none tracking-normal text-bg ring-2 ring-surface">{unread}</span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">{t(locale, n.key)}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
