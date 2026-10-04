"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BarChart3, Briefcase, CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, MessageSquare, MoreHorizontal, Settings, Users } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { Avatar, cn } from "./ui";
import { BrandMark, Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette, PaletteTrigger } from "./command-palette";
import { Toaster } from "./toast";
import { QuickActionsFab, type QuickAction } from "./quick-actions";

const NAV = [
  { href: "/", key: "nav.command", icon: LayoutDashboard, shortcut: "t" },
  { href: "/clients", key: "nav.clients", icon: Users, shortcut: "c" },
  { href: "/agenda", key: "nav.agenda", icon: CalendarDays, shortcut: "a" },
  { href: "/review", key: "nav.review", icon: ClipboardCheck, shortcut: "r" },
  { href: "/messages", key: "nav.messages", icon: MessageSquare, shortcut: "m" },
  { href: "/analytics", key: "nav.analytics", icon: BarChart3, shortcut: "" },
  { href: "/business", key: "nav.business", icon: Briefcase, shortcut: "" },
  { href: "/settings", key: "nav.settings", icon: Settings, shortcut: "" },
] as const;

/** Mobile bottom bar: the coach's daily loop. Everything else lives under "More" (settings page). */
const MOBILE = ["/", "/clients", "/agenda", "/messages", "/review"];

export function CoachShell({ locale, userName, orgName, badges, children, logout }: { locale: Locale; userName: string; orgName: string; badges: { unanswered: number; attention: number; pendingCheckins: number }; children: React.ReactNode; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const badgeFor = (href: string) => (href === "/messages" ? badges.unanswered : href === "/" ? badges.attention : href === "/review" ? badges.pendingCheckins : 0);
  const immersive = /\/train\//.test(pathname); // workout mode: hide bottom nav
  const themeLabels = { toLight: t(locale, "theme.toLight"), toDark: t(locale, "theme.toDark") };

  // Single-key shortcuts (never while typing). Discoverable in the palette footer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (k === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event("coachos:open-palette"));
        return;
      }
      if (k === "n") router.push("/clients/new");
      else if (k === "m") router.push("/messages");
      else if (k === "c") router.push("/clients");
      else if (k === "a") router.push("/agenda");
      else if (k === "r") router.push("/review");
      else if (k === "t") router.push("/");
      else if (k === "?") window.dispatchEvent(new Event("coachos:open-palette"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const quick: QuickAction[] = [
    { key: "search", label: t(locale, "common.search"), hint: t(locale, "cmd.clients"), icon: "search", event: "coachos:open-palette" },
    { key: "client", label: t(locale, "cmd.addClient"), icon: "client", href: "/clients/new" },
    { key: "agenda", label: t(locale, "cmd.agenda"), icon: "agenda", href: "/agenda" },
    { key: "message", label: t(locale, "cmd.sendMessage"), icon: "message", href: "/messages" },
    { key: "review", label: t(locale, "nav.review"), icon: "review", href: "/review" },
    { key: "analytics", label: t(locale, "nav.analytics"), icon: "measure", href: "/analytics" },
  ];

  return (
    <div className="flex min-h-dvh">
      <CommandPalette locale={locale} />
      <Toaster />
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        <div className="flex items-center gap-3 px-4 pb-5 pt-5">
          <BrandMark size={34} />
          <Wordmark sub={orgName} />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="main">
          {NAV.map((n) => {
            const active = isActive(n.href);
            const b = badgeFor(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn("press relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium", active ? "bg-accent-soft text-accent glow-sm" : "text-muted hover:bg-surface-2 hover:text-ink")}
                aria-current={active ? "page" : undefined}
              >
                {active ? <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent" /> : null}
                <n.icon className="size-[18px] shrink-0" />
                <span className="flex-1 truncate">{t(locale, n.key)}</span>
                {b ? (
                  <span className={cn("tnum min-w-5 rounded-full px-1.5 text-center font-display text-[12px] font-bold leading-5", active ? "bg-accent text-accent-ink" : "bg-bad-soft text-bad")}>{b}</span>
                ) : n.shortcut ? (
                  <kbd className="rounded border border-border bg-surface-2 px-1 font-sans text-[10px] uppercase text-muted-2">{n.shortcut}</kbd>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-1 flex items-center gap-2.5 px-1 py-1.5">
            <Avatar name={userName} size={30} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2">{userName}</span>
          </div>
          <ThemeToggle labels={themeLabels} withLabel className="w-full justify-start" />
          <form action={logout}>
            <button type="submit" className="press flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-surface-2">
              <LogOut className="size-4" />
              {t(locale, "nav.logout")}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur-md lg:gap-3 lg:px-6">
          <Link href="/" className="grid size-11 shrink-0 place-items-center lg:hidden" aria-label="COAVEX">
            <BrandMark size={32} />
          </Link>
          <div className="min-w-0 flex-1">
            <PaletteTrigger locale={locale} />
          </div>
          <ThemeToggle labels={themeLabels} className="h-11 w-11 shrink-0 lg:hidden" />
          <Link href="/settings" className="grid size-11 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden" aria-label={t(locale, "nav.settings")}>
            <MoreHorizontal className="size-5" />
          </Link>
        </header>
        <main className={cn("flex-1 px-4 pt-5 lg:px-8 lg:pb-10", immersive ? "pb-4" : "pb-28")}>{children}</main>
      </div>

      {/* no FAB in a conversation: the composer's send button sits where the FAB would float */}
      {!immersive && !/^\/messages\/[^/]+/.test(pathname) ? <QuickActionsFab actions={quick} title={t(locale, "cc.quickActions")} /> : null}

      {/* Bottom nav (mobile) — dark glass, active item lime with a glowing indicator */}
      {!immersive ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_-18px_rgb(0_0_0/0.7)] backdrop-blur-xl lg:hidden" aria-label="mobile">
          {MOBILE.map((href) => {
            const n = NAV.find((x) => x.href === href)!;
            const active = isActive(n.href);
            const b = badgeFor(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("press relative flex h-16 flex-col items-center justify-start gap-1 pt-2.5 text-[11px] font-semibold", active ? "text-accent" : "text-muted hover:text-ink-2")} aria-current={active ? "page" : undefined}>
                {active ? <span aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-accent glow-sm" /> : null}
                <n.icon className="size-[22px] shrink-0" strokeWidth={active ? 2.3 : 1.9} />
                {/* two lines max: long labels (Arabic "Weekly review") stay readable instead of being cut */}
                <span className="line-clamp-2 max-w-full px-0.5 text-center leading-3">{t(locale, n.href === "/" ? "nav.today" : n.key)}</span>
                {b ? (
                  <span className={cn("tnum absolute top-1.5 start-[calc(50%+4px)] min-w-[18px] rounded-full px-1 text-center text-[10.5px] font-bold leading-[18px] text-bg ring-2 ring-surface", n.href === "/review" ? "bg-warn" : "bg-bad")}>{b}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
