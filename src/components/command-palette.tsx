"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Activity, CalendarDays, Clock, ClipboardList, FileText, MessageSquare, RefreshCw, Search, UserPlus, Users, Zap } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";

type Result = { type: "client" | "note" | "checkin" | "program" | "exercise"; id: string; title: string; sub?: string; href: string };
type Recent = { id: string; title: string; href: string };
const RECENT_KEY = "coachos:recent-clients";

export function rememberClient(id: string, title: string) {
  try {
    const cur: Recent[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    const next = [{ id, title, href: `/clients/${id}` }, ...cur.filter((c) => c.id !== id)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function CommandPalette({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("coachos:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("coachos:open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setResults((await r.json()).results as Result[]);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, q ? 100 : 0);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open]);

  const go = useCallback(
    (href: string, remember?: { id: string; title: string }) => {
      if (remember) rememberClient(remember.id, remember.title);
      setOpen(false);
      setQ("");
      router.push(href);
    },
    [router],
  );

  const recompute = useCallback(async () => {
    setOpen(false);
    await fetch("/api/intelligence/recompute", { method: "POST" });
    router.refresh();
  }, [router]);

  if (!open) return null;

  const actions = [
    { icon: UserPlus, label: t(locale, "cmd.addClient"), href: "/clients/new", kbd: "N" },
    { icon: CalendarDays, label: t(locale, "cmd.agenda"), href: "/agenda", kbd: "A" },
    { icon: MessageSquare, label: t(locale, "cmd.sendMessage"), href: "/messages", kbd: "M" },
    { icon: FileText, label: t(locale, "cmd.review"), href: "/review", kbd: "R" },
    { icon: ClipboardList, label: t(locale, "cmd.createProgram"), href: "/clients?intent=program" },
    { icon: Activity, label: t(locale, "cmd.recordMeasurement"), href: "/clients?intent=measurement" },
  ];
  const pages = [
    { label: t(locale, "nav.command"), href: "/", kbd: "T" },
    { label: t(locale, "nav.clients"), href: "/clients", kbd: "C" },
    { label: t(locale, "nav.analytics"), href: "/analytics" },
    { label: t(locale, "nav.business"), href: "/business" },
    { label: t(locale, "nav.settings"), href: "/settings" },
  ];
  const clients = results.filter((r) => r.type === "client");
  const others = results.filter((r) => r.type !== "client");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--backdrop)] backdrop-blur-[3px] sm:p-4 sm:pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface sm:h-auto sm:max-w-xl sm:rounded-lg sm:border sm:border-border-strong sm:shadow-[var(--shadow)]" style={{ animation: "sheet-in var(--t-med) var(--ease-out) both" }}>
        <Command label="Command palette" shouldFilter={false} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-[18px] shrink-0 text-accent" />
            {/* the row carries the hairline; inline style beats the unlayered [cmdk-input] rule */}
            <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={t(locale, "cmd.placeholder")} style={{ borderBottom: 0, paddingInline: 6 }} />
            <button type="button" onClick={() => setOpen(false)} className="press h-10 rounded-md px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2 sm:hidden">
              {t(locale, "common.close")}
            </button>
          </div>
          <Command.List className="min-h-0 flex-1 sm:max-h-[min(60vh,440px)] [&_[cmdk-item][data-selected=true]_svg]:text-accent [&_[cmdk-item][data-selected=true]_kbd]:border-accent/40">
            {loading && !results.length ? <div className="px-3 py-2 text-[12px] text-muted">{t(locale, "common.loading")}</div> : null}
            {!q && recent.length ? (
              <Command.Group heading={t(locale, "cmd.recent")}>
                {recent.map((r) => (
                  <Command.Item key={`recent-${r.id}`} value={`recent-${r.id}`} onSelect={() => go(r.href, { id: r.id, title: r.title })}>
                    <Clock className="size-4 text-muted" />
                    <span className="flex-1 truncate">{r.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {clients.length ? (
              <Command.Group heading={t(locale, "cmd.clients")}>
                {clients.map((r) => (
                  <Command.Item key={r.id} value={`client-${r.id}`} onSelect={() => go(r.href, { id: r.id, title: r.title })}>
                    <Users className="size-4 text-muted" />
                    <span className="flex-1 truncate">{r.title}</span>
                    {r.sub ? <span className="text-[12px] text-muted">{t(locale, `status.${r.sub}`)}</span> : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {others.length ? (
              <Command.Group heading={t(locale, "common.search")}>
                {others.map((r) => (
                  <Command.Item key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)}>
                    <FileText className="size-4 text-muted" />
                    <span className="flex-1 truncate">{r.title}</span>
                    {r.sub ? <span className="truncate text-[12px] text-muted">{r.sub}</span> : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {!q ? (
              <>
                <Command.Group heading={t(locale, "cmd.actions")}>
                  {actions.map((a) => (
                    <Command.Item key={a.href} value={a.href} onSelect={() => go(a.href)}>
                      <a.icon className="size-4 text-muted" />
                      <span className="flex-1">{a.label}</span>
                      {a.kbd ? <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 text-[11px] text-muted sm:inline">{a.kbd}</kbd> : null}
                    </Command.Item>
                  ))}
                  <Command.Item value="recompute" onSelect={recompute}>
                    <RefreshCw className="size-4 text-muted" />
                    <span>{t(locale, "cmd.recompute")}</span>
                  </Command.Item>
                </Command.Group>
                <Command.Group heading={t(locale, "cmd.pages")}>
                  {pages.map((p) => (
                    <Command.Item key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                      <Zap className="size-4 text-muted" />
                      <span className="flex-1">{p.label}</span>
                      {p.kbd ? <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 text-[11px] text-muted sm:inline">{p.kbd}</kbd> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            ) : null}
            {q && !loading && !results.length ? <Command.Empty>{t(locale, "cmd.noResults")}</Command.Empty> : null}
          </Command.List>
          <div className="hidden items-center gap-3 border-t border-border bg-surface-2/50 px-3 py-2 text-[11px] text-muted sm:flex">
            <span className="font-semibold uppercase tracking-[0.12em]">{t(locale, "shortcuts.title")}</span>
            <span>
              <kbd className="rounded border border-border bg-surface-2 px-1">↑↓</kbd> · <kbd className="rounded border border-border bg-surface-2 px-1">↵</kbd>
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface-2 px-1">/</kbd> {t(locale, "common.search")}
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface-2 px-1">N</kbd> {t(locale, "cmd.addClient")}
            </span>
            <span>
              <kbd className="rounded border border-border bg-surface-2 px-1">T</kbd> {t(locale, "nav.command")}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

export function PaletteTrigger({ locale }: { locale: Locale }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("coachos:open-palette"))}
      className="press flex h-11 w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-[13.5px] text-muted hover:border-accent/40 hover:text-ink-2 sm:w-80 lg:h-10"
      aria-label={t(locale, "common.search")}
    >
      <Search className="size-4" />
      <span className="flex-1 truncate text-start">{t(locale, "common.search")}…</span>
      <kbd className="hidden rounded border border-border-strong bg-surface px-1.5 text-[11px] text-muted sm:inline">Ctrl K</kbd>
    </button>
  );
}
