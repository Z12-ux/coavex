import Link from "next/link";
import { CalendarClock, ClipboardCheck, MessageSquare, Plus } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { clientRows } from "@/server/queries";
import { t } from "@/lib/i18n/dictionary";
import { fmtRelative } from "@/lib/format";
import { tx } from "@/domain/catalog";
import { Avatar, Badge, EmptyState, LinkButton, PageHeader, cn, severityTone, statusTone } from "@/components/ui";
import { BarStrip, RingGauge } from "@/components/charts";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "attention", "active", "onboarding", "paused"] as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ filter?: string; intent?: string }> }) {
  const user = await pageUser("staff");
  const locale = user.locale;
  const { filter = "all", intent } = await searchParams;
  const rows = await clientRows(user.orgId, locale);
  const visible = rows.filter((r) => {
    if (filter === "attention") return r.topAction !== null;
    if (filter === "active") return r.status === "ACTIVE" || r.status === "TRIAL";
    if (filter === "onboarding") return r.status === "ONBOARDING";
    if (filter === "paused") return r.status === "PAUSED" || r.status === "CHURNED";
    return true;
  });
  // Attention first, then alphabetical: the coach scans what matters.
  const sev = (s: string | null) => (s === "URGENT" ? 3 : s === "ATTENTION" ? 2 : s === "WATCH" ? 1 : 0);
  visible.sort((a, b) => sev(b.maxSeverity) - sev(a.maxSeverity) || a.firstName.localeCompare(b.firstName));
  const momentumGlyph = (m: string) => (m === "IMPROVING" ? "↑" : m === "DECLINING" ? "↓" : m === "STABLE" ? "→" : "–");
  const momentumTone = (m: string) => (m === "IMPROVING" ? "good" : m === "DECLINING" ? "bad" : "neutral");
  const momentumLabel = (m: string) => tx(locale, `mom.status.${m}`);
  const intentSuffix = intent === "program" ? "?tab=training" : intent === "measurement" ? "?tab=overview&add=measurement" : "";
  const adhTone = (a: number | null) => (a === null ? "accent" : a >= 75 ? "good" : a >= 50 ? "warn" : "bad");
  const edge = (s: string | null) => (s === "URGENT" ? "bg-bad" : s === "ATTENTION" ? "bg-warn" : s === "WATCH" ? "bg-info" : null);
  const activeCount = rows.filter((r) => r.status === "ACTIVE" || r.status === "TRIAL").length;
  const attentionCount = rows.filter((r) => r.topAction).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t(locale, "clients.title")}
        sub={
          <span className="tnum">
            <span className="font-display text-[15px] font-bold text-ink">{rows.length}</span> · <span className="font-display text-[15px] font-bold text-ink">{activeCount}</span> {t(locale, "clients.filter.active").toLowerCase()}
          </span>
        }
        action={
          <LinkButton href="/clients/new">
            <Plus className="size-4" />
            {t(locale, "clients.new")}
          </LinkButton>
        }
      />
      <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" aria-label={t(locale, "clients.status")}>
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <Link
              key={f}
              href={`/clients?filter=${f}`}
              aria-current={on ? "page" : undefined}
              className={cn("press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[12px] font-semibold uppercase tracking-[0.08em]", on ? "border-accent/50 bg-accent-soft text-accent" : "border-border bg-surface text-ink-2 hover:border-border-strong hover:bg-surface-2")}
            >
              {t(locale, `clients.filter.${f}`)}
              {f === "attention" ? <span className={cn("tnum rounded-full px-1.5 font-display text-[13px] leading-5 tracking-normal", on ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2")}>{attentionCount}</span> : null}
            </Link>
          );
        })}
      </nav>

      {!rows.length ? (
        <EmptyState title={t(locale, "clients.empty")} why={t(locale, "clients.emptyWhy")} cta={<LinkButton href="/clients/new">{t(locale, "clients.emptyCta")}</LinkButton>} />
      ) : (
        <>
          {/* Phone / tablet: scannable cards — name · status · today's signal · next action · quick actions */}
          <ul className="enter-stagger space-y-2.5 md:hidden">
            {visible.map((r) => {
              const e = edge(r.maxSeverity);
              return (
                <li key={r.id} className="relative overflow-hidden rounded-lg border border-border bg-surface">
                  {e ? <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", e)} /> : null}
                  <div className="flex items-center gap-3 py-3 pe-2 ps-3.5">
                    <Link href={`/clients/${r.id}${intentSuffix}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={`${r.firstName} ${r.lastName}`} size={42} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="text-[15px] font-semibold leading-5 text-ink">
                            {r.firstName} {r.lastName}
                          </span>
                          <span title={momentumLabel(r.momentum)} className="shrink-0">
                            <Badge tone={momentumTone(r.momentum)}>
                              <span aria-hidden>{momentumGlyph(r.momentum)}</span>
                              <span className="sr-only">{momentumLabel(r.momentum)}</span>
                            </Badge>
                          </span>
                          {r.status !== "ACTIVE" ? (
                            <Badge tone={statusTone(r.status)} className="shrink-0">
                              {t(locale, `status.${r.status}`)}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="t-caption mt-1 flex items-start gap-1">
                          {r.nextSession ? <CalendarClock className="mt-px size-3.5 shrink-0" /> : r.lastCheckIn ? <ClipboardCheck className="mt-px size-3.5 shrink-0" /> : null}
                          <span>{r.nextSession ? `${t(locale, "clients.nextSession")} ${fmtRelative(r.nextSession, locale)}` : r.lastCheckIn ? `${t(locale, "clients.lastCheckIn")} ${fmtRelative(r.lastCheckIn, locale)}` : "—"}</span>
                        </span>
                        {r.topAction ? (
                          <span className={cn("mt-1 line-clamp-2 text-[13px] font-medium leading-[18px]", r.maxSeverity === "URGENT" ? "text-bad" : r.maxSeverity === "ATTENTION" ? "text-warn" : "text-ink-2")}>
                            {r.maxSeverity && r.maxSeverity !== "INFO" ? "⚠ " : "→ "}
                            {r.topAction}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                    <RingGauge value={r.adherence28 === null ? null : r.adherence28 / 100} size={44} stroke={4} tone={adhTone(r.adherence28)} className="shrink-0" label={t(locale, "clients.adherence")}>
                      <span className="tnum font-display text-[12px] font-bold text-ink-2">{r.adherence28 === null ? "–" : `${r.adherence28}%`}</span>
                    </RingGauge>
                    <Link href={`/messages/${r.id}`} className="press grid size-11 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-accent" aria-label={t(locale, "client.actions.message")}>
                      <MessageSquare className="size-5" />
                    </Link>
                  </div>
                </li>
              );
            })}
            {!visible.length ? <li className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted">{t(locale, "cmd.noResults")}</li> : null}
          </ul>

          {/* Desktop: dense table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-[13px]">
              <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t(locale, "clients.title")}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t(locale, "clients.momentum")}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t(locale, "clients.adherence")}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t(locale, "clients.lastCheckIn")}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t(locale, "clients.nextSession")}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t(locale, "cc.nextAction")}</th>
                  <th className="px-3 py-3 text-end font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => {
                  const e = edge(r.maxSeverity);
                  return (
                    <tr key={r.id} className="group hover:bg-surface-2/60">
                      <td className="relative px-4 py-2.5">
                        {e ? <span aria-hidden className={cn("absolute inset-y-2 start-0 w-[3px] rounded-e-full", e)} /> : null}
                        <Link href={`/clients/${r.id}${intentSuffix}`} className="flex items-center gap-3">
                          <Avatar name={`${r.firstName} ${r.lastName}`} size={34} />
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-semibold text-ink group-hover:underline">
                              {r.firstName} {r.lastName}
                            </span>
                            <Badge tone={statusTone(r.status)}>{t(locale, `status.${r.status}`)}</Badge>
                            {r.maxSeverity && r.maxSeverity !== "INFO" ? <Badge tone={severityTone(r.maxSeverity)}>{r.signalCount}</Badge> : null}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span title={momentumLabel(r.momentum)}>
                          <Badge tone={momentumTone(r.momentum)}>
                            <span aria-hidden>{momentumGlyph(r.momentum)}</span>
                            <span className="sr-only">{momentumLabel(r.momentum)}</span>
                          </Badge>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <RingGauge value={r.adherence28 === null ? null : r.adherence28 / 100} size={30} stroke={3.5} tone={adhTone(r.adherence28)} label={t(locale, "clients.adherence")} />
                          <span className="tnum w-10 font-display text-[16px] font-bold text-ink">{r.adherence28 === null ? "–" : `${r.adherence28}%`}</span>
                          <BarStrip items={r.weekly.map((v, i) => ({ label: `S-${4 - i}`, value: v }))} width={48} height={20} />
                        </div>
                      </td>
                      <td className="tnum px-3 py-2.5 text-muted">{r.lastCheckIn ? fmtRelative(r.lastCheckIn, locale) : "–"}</td>
                      <td className="tnum px-3 py-2.5 text-muted">{r.nextSession ? fmtRelative(r.nextSession, locale) : "–"}</td>
                      <td className={cn("max-w-[260px] truncate px-3 py-2.5 font-medium", r.maxSeverity === "URGENT" ? "text-bad" : r.maxSeverity === "ATTENTION" ? "text-warn" : "text-ink-2")}>{r.topAction ?? <span className="font-normal text-muted-2">—</span>}</td>
                      <td className="px-3 py-2.5 text-end">
                        <Link href={`/messages/${r.id}`} className="press inline-grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface-3 hover:text-accent" aria-label={t(locale, "client.actions.message")}>
                          <MessageSquare className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length ? <p className="px-4 py-6 text-center text-[13px] text-muted">{t(locale, "cmd.noResults")}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
