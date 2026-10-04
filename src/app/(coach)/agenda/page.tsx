import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Clock, Dumbbell, X } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import { addDays, isoDate, startOfDay, startOfWeek } from "@/domain/stats";
import { FRICTION_CATEGORIES } from "@/domain/types";
import { tx } from "@/domain/catalog";
import { Badge, Button, EmptyState, PageHeader, buttonClass, cn, selectClass } from "@/components/ui";
import { RingGauge } from "@/components/charts";
import { setSessionStatusAction } from "@/server/actions/programs";

export const dynamic = "force-dynamic";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await pageUser("staff");
  const locale = user.locale;
  const { week } = await searchParams;
  const now = new Date();
  const base = week ? new Date(week) : now;
  const weekStart = startOfWeek(base);
  const weekEnd = addDays(weekStart, 7);
  const sessions = await db.workoutSession.findMany({
    where: { client: { orgId: user.orgId }, scheduledFor: { gte: weekStart, lt: weekEnd } },
    include: { client: { select: { id: true, firstName: true, lastName: true } }, workout: { select: { name: true, estimatedMinutes: true } } },
    orderBy: { scheduledFor: "asc" },
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = startOfDay(now).getTime();
  const count = (s: string) => sessions.filter((x) => x.status === s).length;
  const done = count("COMPLETED");
  const statusTone = (status: string, past: boolean) => (status === "COMPLETED" ? "good" : status === "MISSED" ? "bad" : status === "SCHEDULED" ? (past ? "warn" : "neutral") : "neutral");
  const navBtn = buttonClass("outline", "md", "h-11 min-w-11 px-3");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t(locale, "agenda.title")}
        sub={`${fmtDate(weekStart, locale)} – ${fmtDate(addDays(weekEnd, -1), locale)}`}
        action={
          <div className="flex gap-1.5">
            <Link href={`/agenda?week=${isoDate(addDays(weekStart, -7))}`} className={navBtn} aria-label={t(locale, "agenda.prevWeek")} title={t(locale, "agenda.prevWeek")}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Link>
            <Link href="/agenda" className={cn(navBtn, "text-[12.5px] font-semibold uppercase tracking-[0.08em]")}>
              {t(locale, "common.today")}
            </Link>
            <Link href={`/agenda?week=${isoDate(addDays(weekStart, 7))}`} className={navBtn} aria-label={t(locale, "agenda.nextWeek")} title={t(locale, "agenda.nextWeek")}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Link>
          </div>
        }
      />
      {!sessions.length ? (
        <EmptyState title={t(locale, "agenda.empty")} why={t(locale, "client.program.noneWhy")} />
      ) : (
        <>
          {/* Week at a glance: completion ring + status counts */}
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <RingGauge value={sessions.length ? done / sessions.length : null} size={52} stroke={5} label={t(locale, "cc.completed")}>
              <span className="tnum font-display text-[12px] font-bold text-ink-2">{Math.round((done / sessions.length) * 100)}%</span>
            </RingGauge>
            <div>
              <div className="t-kicker">{t(locale, "cc.completed")}</div>
              <div className="tnum font-display text-[26px] font-bold leading-7 text-ink">
                {done}
                <span className="text-[16px] text-muted">/{sessions.length}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:ms-auto">
              {(["COMPLETED", "MISSED", "SCHEDULED"] as const).map((s) => (
                <Badge key={s} tone={statusTone(s, false)} className="gap-1.5 px-2.5 py-1">
                  {t(locale, `session.status.${s}`)}
                  <span className="tnum font-display text-[13px] font-bold leading-none">{count(s)}</span>
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5 md:grid-cols-7">
            {days.map((d) => {
              const list = sessions.filter((s) => startOfDay(s.scheduledFor).getTime() === startOfDay(d).getTime());
              const isToday = startOfDay(d).getTime() === today;
              return (
                <section key={d.toISOString()} className={cn("min-w-0 rounded-lg border bg-surface", isToday ? "neon-edge bg-accent-soft/20" : "border-border")}>
                  <header className={cn("flex items-baseline justify-between gap-2 border-b px-3 py-2", isToday ? "border-accent/25" : "border-border")}>
                    <span className="flex items-baseline gap-1.5">
                      <span className={cn("text-[11px] font-semibold uppercase tracking-[0.14em]", isToday ? "text-accent" : "text-muted")}>{fmtDate(d, locale, { weekday: "short" })}</span>
                      <span className={cn("tnum font-display text-[22px] font-bold leading-6", isToday ? "text-accent" : "text-ink")}>{fmtDate(d, locale, { day: "numeric" })}</span>
                    </span>
                    {list.length ? <span className="tnum text-[11.5px] font-semibold text-muted">{list.length}</span> : null}
                  </header>
                  <ul className="divide-y divide-border">
                    {list.map((s) => {
                      const past = s.scheduledFor < now;
                      return (
                        <li key={s.id} className="px-3 py-2.5 text-[12.5px]">
                          <Link href={`/clients/${s.client.id}?tab=training`} className="block font-semibold leading-[18px] text-ink hover:underline">
                            {s.client.firstName} {s.client.lastName}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Dumbbell className="size-3 shrink-0" />
                              {s.workout?.name ?? "—"}
                            </span>
                            <span className="tnum inline-flex items-center gap-1">
                              <Clock className="size-3 shrink-0" />
                              {fmtDate(s.scheduledFor, locale, { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Badge tone={statusTone(s.status, past)}>{t(locale, `session.status.${s.status}`)}</Badge>
                            {s.missedReason ? <span className="text-[11.5px] text-muted">{tx(locale, `friction.${s.missedReason}`)}</span> : null}
                          </div>
                          {s.status === "SCHEDULED" && isToday ? (
                            <Link href={`/clients/${s.client.id}/train/${s.id}`} className="press mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold leading-4 text-accent hover:border-accent/70 md:min-h-9">
                              <Dumbbell className="size-3.5 shrink-0" />
                              {t(locale, "cc.startWorkout")}
                            </Link>
                          ) : null}
                          {s.status === "SCHEDULED" && past ? (
                            <ActionForm action={setSessionStatusAction} className="mt-2 flex flex-col gap-1.5" toast={t(locale, "toast.updated")}>
                              <input type="hidden" name="sessionId" value={s.id} />
                              <select name="missedReason" className={cn(selectClass, "h-11 text-[12.5px] md:h-9")} defaultValue="" aria-label={t(locale, "client.today.missedWhy")}>
                                <option value="">{t(locale, "client.today.missedWhy")}</option>
                                {FRICTION_CATEGORIES.map((f) => (
                                  <option key={f} value={f}>
                                    {tx(locale, `friction.${f}`)}
                                  </option>
                                ))}
                              </select>
                              <div className="flex gap-1">
                                <Button name="status" value="COMPLETED" size="sm" variant="outline" className="h-11 flex-1 md:h-9" aria-label={t(locale, "cc.completed")} title={t(locale, "cc.completed")}>
                                  <Check className="size-4 text-good" />
                                </Button>
                                <Button name="status" value="MISSED" size="sm" variant="ghost" className="h-11 flex-1 md:h-9" aria-label={t(locale, "client.today.missed")} title={t(locale, "client.today.missed")}>
                                  <X className="size-4 text-bad" />
                                </Button>
                              </div>
                            </ActionForm>
                          ) : null}
                        </li>
                      );
                    })}
                    {!list.length ? <li className="px-3 py-3 text-[12px] text-muted-2">—</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
