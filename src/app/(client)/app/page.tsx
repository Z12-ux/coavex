import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Dumbbell, Flame, Layers, ListChecks, MessageSquare, Moon, Route, Sparkles, Target, Timer } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, greetingKey } from "@/lib/format";
import { DayStrip, RingGauge, type DayState } from "@/components/charts";
import { HeroCard } from "@/components/stat-card";
import { MuscleMap, muscleGroupsOf } from "@/components/muscle-map";
import { tx } from "@/domain/catalog";
import { addDays, daysBetween, isSameDay, startOfDay, startOfWeek, weeklyCompletion } from "@/domain/stats";
import { lastExpectedCheckIn } from "@/domain/signals";
import { missedSessionOptions } from "@/domain/program";
import { FRICTION_CATEGORIES, type FrictionCategory, type Locale, type SessionStatus } from "@/domain/types";
import { Badge, Button, CtaArrow, Field, Panel, PanelHeader, Scale, buttonClass, cn, inputClass, selectClass } from "@/components/ui";
import { logDailyAction, markMissedAction, toggleHabitLogAction } from "@/server/actions/client-app";

export const dynamic = "force-dynamic";

/** "45 min" / "1 h 05" */
function fmtDuration(min: number, locale: Locale): string {
  if (min < 60) return `${min} ${t(locale, "common.min")}`;
  return `${Math.floor(min / 60)} ${t(locale, "unit.hour")} ${String(min % 60).padStart(2, "0")}`;
}

/** Muscle-group names for chips and the map's accessible label. */
function groupNames(groups: readonly string[], locale: Locale): string[] {
  return groups.map((g) => t(locale, `muscle.${g}`));
}

/** Workout focus (LOWER → "Bas du corps") — same keys as the coach training tab; raw value until translated. */
function focusLabel(focus: string, locale: Locale): string {
  const key = `workout.focus.${focus}`;
  const v = t(locale, key);
  return v === key ? focus.replace(/_/g, " ") : v;
}

const exerciseGroupsSelect = { select: { exercise: { select: { muscleGroup: true } } } } as const;

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ done?: string; pr?: string; checkin?: string }> }) {
  const user = await pageUser("client");
  const locale = user.locale;
  const sp = await searchParams;
  const now = new Date();
  const today = startOfDay(now);
  const client = await db.client.findUnique({
    where: { id: user.clientId! },
    include: {
      workoutSessions: {
        where: { scheduledFor: { gte: addDays(today, -56), lt: addDays(today, 8) } },
        include: {
          workout: { select: { name: true, estimatedMinutes: true, focus: true, exercises: { orderBy: { order: "asc" }, ...exerciseGroupsSelect } } },
          _count: { select: { sets: true } },
        },
        orderBy: { scheduledFor: "asc" },
      },
      programs: {
        where: { status: "ACTIVE" },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { id: true, name: true, workouts: { orderBy: { order: "asc" }, select: { id: true, name: true, estimatedMinutes: true, focus: true, exercises: exerciseGroupsSelect } } },
      },
      habits: { where: { active: true }, include: { logs: { where: { date: today } } } },
      nutritionPlans: { where: { active: true }, take: 1 },
      dailyLogs: { where: { date: today }, take: 1 },
      checkIns: { orderBy: { weekStart: "desc" }, take: 1 },
      messages: { where: { direction: "COACH_TO_CLIENT" }, orderBy: { createdAt: "desc" }, take: 1 },
      milestones: { orderBy: { reachedAt: "desc" }, take: 1 },
    },
  });
  if (!client) return null;

  const sessions = client.workoutSessions;
  const todays = sessions.find((s) => isSameDay(s.scheduledFor, today) && s.status !== "SKIPPED" && s.status !== "RESCHEDULED");
  const overdue = sessions.filter((s) => s.status === "SCHEDULED" && s.scheduledFor < today && daysBetween(s.scheduledFor, now) <= 3);
  const next = sessions.find((s) => s.status === "SCHEDULED" && s.scheduledFor > now && !isSameDay(s.scheduledFor, today));
  const snapSessions = sessions.map((s) => ({ id: s.id, scheduledFor: s.scheduledFor, status: s.status as SessionStatus, completedAt: s.completedAt, durationMin: s.durationMin, sessionRpe: s.sessionRpe, isShortened: s.isShortened, missedReason: (s.missedReason as FrictionCategory | null) ?? null, workoutName: s.workout?.name ?? null }));
  const weeks = weeklyCompletion(snapSessions, now, 8);
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].planned >= 2 && (weeks[i].rate ?? 0) >= 0.9) streak++;
    else break;
  }
  const expected = lastExpectedCheckIn(now, client.checkInWeekday);
  const ciDone = client.checkIns[0]?.submittedAt && client.checkIns[0].submittedAt >= addDays(expected, -3);
  const checkinDue = !ciDone && daysBetween(expected, now) >= 0 && daysBetween(client.onboardedAt, now) >= 5;
  const log = client.dailyLogs[0];
  const plan = client.nutritionPlans[0];
  const lastMsg = client.messages[0];
  const program = client.programs[0];
  const scale = [1, 2, 3, 4, 5].map((n) => t(locale, `scale.${n}`));

  // ── This week ──────────────────────────────────────────────────────────────
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const inWeek = (d: Date) => d >= weekStart && d < weekEnd;
  const weekSessions = snapSessions.filter((s) => inWeek(s.scheduledFor));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    // Same rule as the x/y count below: a skipped / rescheduled session no longer makes the day "planned".
    const s = weekSessions.filter((x) => isSameDay(x.scheduledFor, d) && x.status !== "SKIPPED" && x.status !== "RESCHEDULED");
    let state: DayState = "none";
    if (s.some((x) => x.status === "COMPLETED")) state = "done";
    else if (s.some((x) => x.status === "MISSED" || (x.status === "SCHEDULED" && x.scheduledFor < today))) state = "missed";
    else if (s.length) state = "planned";
    // Arabic weekday names have no abbreviation: cutting them to 3 letters breaks the word.
    const wd = fmtDate(d, locale, { weekday: "short" }).replace(/\.$/, "");
    return { key: d.toISOString(), label: locale === "ar" ? wd : wd.slice(0, 3), state, today: isSameDay(d, now), title: s.map((x) => x.workoutName ?? "").join(", ") };
  });
  // Skipped / rescheduled sessions are not "planned" (a reschedule creates a new session): same rule as the coach view.
  const weekPlanned = weekSessions.filter((x) => x.status !== "SKIPPED" && x.status !== "RESCHEDULED").length;
  const weekDone = weekSessions.filter((x) => x.status === "COMPLETED").length;
  const weekCompleted = sessions.filter((s) => s.status === "COMPLETED" && inWeek(s.scheduledFor));
  const weekSets = weekCompleted.reduce((a, s) => a + s._count.sets, 0);
  const weekMinutes = weekCompleted.reduce((a, s) => a + (s.durationMin ?? 0), 0);
  const weekRate = weekPlanned ? weekDone / weekPlanned : null;
  const habitsDone = client.habits.filter((h) => h.logs[0]?.done).length;
  const logFields = log ? [log.sleepHours, log.energy, log.perceivedRecovery, log.soreness, log.stress, log.nutritionAdherence].filter((v) => v !== null && v !== undefined).length : 0;

  // ── Today's workout ────────────────────────────────────────────────────────
  const todayGroups = muscleGroupsOf(todays?.workout?.exercises.map((e) => e.exercise) ?? []);
  const todayMinutes = todays ? (todays.isShortened ? 30 : todays.workout?.estimatedMinutes) : null;

  // ── Program cards: each workout links to its next scheduled session (today first) ──
  const upcoming = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) {
    if (s.workoutId && s.status === "SCHEDULED" && s.scheduledFor >= today && !upcoming.has(s.workoutId)) upcoming.set(s.workoutId, s);
  }

  const nextLine = next ? (
    <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted">
      <CalendarDays className="size-3.5 shrink-0" />
      <span className="min-w-0">
        {t(locale, "client.today.nextSession")}: <span className="font-semibold text-ink-2">{next.workout?.name}</span> · {fmtDate(next.scheduledFor, locale, { weekday: "long", day: "numeric" })}
      </span>
    </p>
  ) : null;

  const workoutMeta = todays ? (
    <>
      <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-2">
        <li className="flex items-center gap-1.5">
          <ListChecks className="size-4 text-accent" />
          <span className="tnum font-semibold text-ink">{todays.workout?.exercises.length ?? 0}</span> {t(locale, "program.exercises").toLowerCase()}
        </li>
        <li className="flex items-center gap-1.5">
          <Timer className="size-4 text-accent" />
          <span className="tnum font-semibold text-ink">~{todayMinutes}</span> {t(locale, "common.min")}
        </li>
        {todays.workout?.focus ? (
          <li className="flex items-center gap-1.5">
            <Target className="size-4 text-accent" />
            {focusLabel(todays.workout.focus, locale)}
          </li>
        ) : null}
      </ul>
      {todays.isShortened ? (
        <Badge tone="warn" className="mt-2">
          {t(locale, "client.workout.shortened")}
        </Badge>
      ) : null}
      {todayGroups.length ? (
        <ul className="mt-3 flex flex-wrap gap-1" aria-label={t(locale, "client.today.muscles")}>
          {groupNames(todayGroups, locale).map((g) => (
            <li key={g} className="rounded-full border border-border-strong bg-surface-2/70 px-2 py-0.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-2">
              {g}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  ) : null;

  return (
    <div className="space-y-4">
      {/* Greeting — small kicker over the one glowing word */}
      <div>
        <h1>
          <span className="block text-[12.5px] font-semibold uppercase leading-4 tracking-[0.18em] text-ink-2">{t(locale, greetingKey(now))},</span>{" "}
          <span className="t-display text-glow mt-1.5 block break-words text-accent">{client.firstName}</span>
        </h1>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {t(locale, "client.today.title")} · {fmtDate(now, locale, { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {sp.done ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-good/40 bg-good-soft px-3.5 py-3 text-[13px]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
          <div>
            <div className="font-semibold text-good">{sp.done} ✓</div>
            {sp.pr ? (
              <div className="flex items-center gap-1 text-ink-2">
                <Sparkles className="size-3.5 text-good" /> {t(locale, "client.workout.pr")}: {sp.pr}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {sp.checkin ? <div className="rounded-lg border border-good/40 bg-good-soft px-3.5 py-3 text-[13px] text-good">{t(locale, "client.checkin.done")}</div> : null}

      {/* Weekly progress — big ring + three stat rows (reference "WEEKLY PROGRESS") */}
      <Panel className="p-4" aria-labelledby="week-progress-h">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="week-progress-h" className="t-kicker">
            {t(locale, "client.today.weekProgress")}
          </h2>
          <span className="tnum truncate text-[12px] text-muted">
            {fmtDate(weekStart, locale)} – {fmtDate(addDays(weekStart, 6), locale)}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <RingGauge value={weekRate} size={118} stroke={10} className="[&_svg]:overflow-visible" label={`${t(locale, "client.today.weekProgress")}: ${weekDone}/${weekPlanned}`}>
            <span className="tnum block font-display text-[38px] font-extrabold leading-none text-ink">
              {weekRate === null ? "–" : Math.round(weekRate * 100)}
              {weekRate === null ? null : <span className="text-[18px] font-bold text-muted">%</span>}
            </span>
            <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{t(locale, "client.today.ring.week")}</span>
          </RingGauge>
          <ul className="min-w-0 flex-1 space-y-3">
            {[
              { key: "sessions", icon: Dumbbell, label: t(locale, "client.today.ring.week"), value: (
                <>
                  {weekDone}
                  <span className="text-[15px] font-semibold text-muted">/{weekPlanned}</span>
                </>
              ) },
              { key: "sets", icon: Layers, label: t(locale, "client.today.stat.sets"), value: weekSets },
              { key: "time", icon: Timer, label: t(locale, "client.today.stat.time"), value: fmtDuration(weekMinutes, locale) },
            ].map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-accent">
                  <s.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-muted">{s.label}</div>
                  <div className="tnum font-display text-[22px] font-bold leading-6 text-ink">{s.value}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* Today's workout — the hero with THE neon CTA when there is one to start */}
      {todays && todays.status === "SCHEDULED" ? (
        <HeroCard aria-labelledby="today-workout-h">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="t-kicker">{t(locale, "client.today.workout")}</p>
              <h2 id="today-workout-h" className="t-title mt-1.5 break-words text-ink">
                {todays.workout?.name}
              </h2>
              {workoutMeta}
            </div>
            {todayGroups.length ? <MuscleMap groups={todayGroups} view="both" height={146} label={groupNames(todayGroups, locale).join(", ")} /> : null}
          </div>
          <Link href={`/app/workout/${todays.id}`} className={buttonClass("neon", "lg", "mt-5 h-14 w-full justify-between rounded-lg ps-5 pe-3 text-[15px]")}>
            <span className="flex items-center gap-2.5">
              <Dumbbell className="size-5" />
              {t(locale, "client.today.start")}
            </span>
            <CtaArrow />
          </Link>
          {nextLine}
        </HeroCard>
      ) : todays ? (
        <Panel className="p-4" aria-labelledby="today-workout-h">
          <div className="flex items-center justify-between gap-2">
            <p className="t-kicker">{t(locale, "client.today.workout")}</p>
            {todays.status === "COMPLETED" ? <Badge tone="good">✓ {t(locale, "common.done")}</Badge> : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="today-workout-h" className="t-title mt-1.5 break-words text-ink">
                {todays.workout?.name}
              </h2>
              {workoutMeta}
            </div>
            {todayGroups.length ? <MuscleMap groups={todayGroups} view="both" height={120} label={groupNames(todayGroups, locale).join(", ")} /> : null}
          </div>
          {nextLine}
        </Panel>
      ) : (
        <Panel className="flex items-start gap-3 p-4" aria-labelledby="today-workout-h">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2 text-muted">
            <Moon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="today-workout-h" className="t-kicker">
              {t(locale, "client.today.workout")}
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">{t(locale, "client.today.noWorkout")}</p>
            {nextLine}
          </div>
        </Panel>
      )}

      {checkinDue ? (
        <Link href="/app/checkin" className="press flex items-center gap-3 rounded-lg border neon-edge bg-accent-soft px-3.5 py-3 hover:brightness-110">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-ink">
            <ClipboardCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink">{t(locale, "client.today.checkinDue")}</div>
            <div className="text-[12.5px] text-ink-2">{t(locale, "client.today.checkinCta")}</div>
          </div>
          <ChevronRight className="size-5 shrink-0 text-accent rtl:rotate-180" />
        </Link>
      ) : null}

      {/* Missed session prompt */}
      {overdue.map((s) => {
        const opts = missedSessionOptions({ missed: snapSessions.find((x) => x.id === s.id)!, weekSessions, now, missedThisWeek: weekSessions.filter((x) => x.status === "MISSED").length + 1 }, locale);
        return (
          <Panel key={s.id} className="border-warn/50">
            <PanelHeader title={`${t(locale, "client.today.missed")} · ${s.workout?.name ?? ""}`} sub={`${fmtDate(s.scheduledFor, locale, { weekday: "long", day: "numeric" })} · ${t(locale, "client.today.missedWhy")}`} />
            <ActionForm action={markMissedAction} className="space-y-2.5 px-4 pb-4" toast={t(locale, "toast.updated")}>
              <input type="hidden" name="sessionId" value={s.id} />
              <select name="reason" className={selectClass} required defaultValue="">
                <option value="" disabled>
                  {t(locale, "client.today.missedWhy")}
                </option>
                {FRICTION_CATEGORIES.map((f) => (
                  <option key={f} value={f}>
                    {tx(locale, `friction.${f}`)}
                  </option>
                ))}
              </select>
              <div className="grid gap-1.5">
                {opts
                  .filter((o) => o.kind !== "COACH_REVIEW")
                  .map((o) => (
                    <label key={o.kind} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border border-border-strong bg-surface-2 px-3 py-2.5 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                      <input type="radio" name="choice" value={o.kind} defaultChecked={o.recommended} className="mt-1 accent-[var(--accent)]" />
                      <span>
                        <span className="font-semibold text-ink">{o.title}</span>
                        <span className="block text-[12px] text-muted">{o.detail}</span>
                      </span>
                    </label>
                  ))}
              </div>
              <Button type="submit" size="lg" variant="outline" className="w-full">
                {t(locale, "common.confirm")}
              </Button>
            </ActionForm>
          </Panel>
        );
      })}

      {/* This week at a glance */}
      <Panel>
        <PanelHeader
          title={t(locale, "client.today.week")}
          action={
            weekPlanned ? (
              <span className="tnum font-display text-[20px] font-bold leading-5 text-ink">
                {weekDone}
                <span className="text-[15px] text-muted">/{weekPlanned}</span>
              </span>
            ) : null
          }
        />
        <div className="px-4 pb-4 pt-1">
          <DayStrip days={days} />
        </div>
      </Panel>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "habits", value: client.habits.length ? habitsDone / client.habits.length : null, text: `${habitsDone}/${client.habits.length}` },
          { key: "log", value: logFields / 6, text: `${logFields}/6` },
          { key: "week", value: weekRate, text: `${weekDone}/${weekPlanned}` },
        ].map((r) => (
          <div key={r.key} className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-1 py-3">
            <RingGauge value={r.value} size={60} stroke={5} className="[&_svg]:overflow-visible" label={t(locale, `client.today.ring.${r.key}`)}>
              <span className="tnum font-display text-[16px] font-bold text-ink">{r.text}</span>
            </RingGauge>
            <span className="max-w-full truncate px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t(locale, `client.today.ring.${r.key}`)}</span>
          </div>
        ))}
      </div>

      {/* My program — horizontal cards (reference "FEATURED PROGRAMS") */}
      {program && program.workouts.length ? (
        <section aria-labelledby="program-h">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="program-h" className="t-kicker">
              {t(locale, "client.today.program")}
            </h2>
            <span className="min-w-0 truncate text-[12px] text-muted">{program.name}</span>
          </div>
          <ul className="-mx-4 mt-2.5 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
            {program.workouts.map((w) => {
              const groups = muscleGroupsOf(w.exercises.map((e) => e.exercise));
              const s = upcoming.get(w.id);
              const isToday = s ? isSameDay(s.scheduledFor, today) : false;
              const body = (
                <>
                  <div className="relative grid h-[118px] place-items-center overflow-hidden border-b border-border bg-surface-2">
                    <span aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
                    <MuscleMap groups={groups} view="both" height={100} label={groupNames(groups, locale).join(", ")} className="relative" />
                  </div>
                  <div className="px-3 pb-3 pt-2.5">
                    <div className="truncate font-display text-[17px] font-bold uppercase leading-5 tracking-[0.02em] text-ink">{w.name}</div>
                    <div className="tnum mt-1 truncate text-[12px] text-muted">
                      ~{w.estimatedMinutes} {t(locale, "common.min")} · {w.exercises.length} {t(locale, "program.exercises").toLowerCase()}
                    </div>
                    {s ? (
                      <div className={cn("mt-1.5 flex items-center gap-1 truncate text-[12px]", isToday ? "font-bold uppercase tracking-[0.08em] text-accent" : "font-medium text-ink-2")}>
                        <CalendarDays className="size-3.5 shrink-0 text-accent" />
                        {isToday ? t(locale, "common.today") : fmtDate(s.scheduledFor, locale, { weekday: "short", day: "numeric" })}
                      </div>
                    ) : null}
                  </div>
                </>
              );
              return (
                <li key={w.id} className="w-[158px] shrink-0 snap-start">
                  {s ? (
                    <Link href={`/app/workout/${s.id}`} className={cn("press block h-full overflow-hidden rounded-lg border bg-surface hover:border-accent/50", isToday ? "neon-edge" : "border-border")}>
                      {body}
                    </Link>
                  ) : (
                    <div className="h-full overflow-hidden rounded-lg border border-border bg-surface">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Habits */}
      {client.habits.length ? (
        <Panel>
          <PanelHeader
            title={t(locale, "client.today.habits")}
            action={
              <span className="tnum font-display text-[20px] font-bold leading-5 text-ink">
                {habitsDone}
                <span className="text-[15px] text-muted">/{client.habits.length}</span>
              </span>
            }
          />
          <ul className="divide-y divide-border px-4 pb-2">
            {client.habits.map((h) => {
              const done = h.logs[0]?.done ?? false;
              return (
                <li key={h.id}>
                  <ActionForm action={toggleHabitLogAction} toast={t(locale, "toast.habit")}>
                    <input type="hidden" name="habitId" value={h.id} />
                    <button type="submit" className="flex min-h-12 w-full items-center gap-3 py-2 text-start" aria-pressed={done}>
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold", done ? "border-accent bg-accent text-accent-ink" : "border-border-strong")}>{done ? "✓" : ""}</span>
                      <span className={cn("flex-1 text-[14px]", done ? "text-muted line-through" : "text-ink")}>{h.name}</span>
                      <span className="tnum text-[12px] text-muted">
                        {h.target} {h.unit}
                      </span>
                    </button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {/* Nutrition targets */}
      {plan ? (
        <Panel>
          <PanelHeader title={t(locale, "client.today.nutrition")} />
          <div className="grid grid-cols-4 gap-2 px-4 pb-4">
            {[
              ["kcal", plan.caloriesTarget],
              ["P", plan.proteinG],
              ["G", plan.carbsG],
              ["L", plan.fatG],
            ].map(([k, v]) => (
              <div key={String(k)} className={cn("rounded-md border px-1 py-2.5 text-center", k === "kcal" ? "neon-edge bg-accent-soft" : "border-border-strong bg-surface-2")}>
                <div className={cn("tnum font-display text-[22px] font-bold leading-6", k === "kcal" ? "text-accent" : "text-ink")}>{v ?? "–"}</div>
                <div className="mt-0.5 text-[11px] font-medium text-muted">{k === "kcal" ? "kcal" : `${k} (g)`}</div>
              </div>
            ))}
          </div>
          {plan.notes ? <p className="px-4 pb-3 text-[12.5px] text-muted">{plan.notes}</p> : null}
        </Panel>
      ) : null}

      {/* Daily log */}
      <Panel>
        <PanelHeader title={t(locale, "client.today.recovery")} action={log ? <Badge tone="good">{t(locale, "client.today.logged")}</Badge> : null} />
        <ActionForm action={logDailyAction} className="space-y-3.5 px-4 pb-4" toast={t(locale, "toast.logged")}>
          <Field label={t(locale, "client.checkin.sleep")}>
            <input name="sleepHours" type="number" step="0.5" min="0" max="16" defaultValue={log?.sleepHours ?? ""} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label={t(locale, "client.checkin.energy")}>
            <Scale name="energy" defaultValue={log?.energy ?? undefined} labels={scale} />
          </Field>
          <Field label={tx(locale, "ev.recovery")}>
            <Scale name="perceivedRecovery" defaultValue={log?.perceivedRecovery ?? undefined} labels={scale} />
          </Field>
          <Field label={t(locale, "client.checkin.soreness")}>
            <Scale name="soreness" defaultValue={log?.soreness ?? undefined} labels={scale} />
          </Field>
          <Field label={t(locale, "client.checkin.stress")}>
            <Scale name="stress" defaultValue={log?.stress ?? undefined} labels={scale} />
          </Field>
          <Field label={t(locale, "client.checkin.nutrition")}>
            <Scale name="nutritionAdherence" defaultValue={log?.nutritionAdherence ?? undefined} labels={scale} />
          </Field>
          <Button type="submit" size="lg" variant={log ? "outline" : "primary"} className="w-full">
            {t(locale, "client.today.log")}
          </Button>
        </ActionForm>
      </Panel>

      {/* Streak + journey */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/app/progress" className="press rounded-lg border border-border bg-surface px-3.5 py-3 hover:border-border-strong">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <Flame className="size-3.5 shrink-0 text-accent" /> {t(locale, "client.today.streak")}
          </div>
          <div className="t-metric mt-1.5 text-ink">{streak}</div>
        </Link>
        <Link href="/app/journey" className="press rounded-lg border border-border bg-surface px-3.5 py-3 hover:border-border-strong">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <Route className="size-3.5 shrink-0 text-accent" /> {t(locale, "nav.journey")}
          </div>
          <div className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-5 text-ink">{client.milestones[0]?.title ?? t(locale, "client.journey.started")}</div>
        </Link>
      </div>

      {lastMsg ? (
        <Link href="/app/messages" className="press flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 hover:border-border-strong">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2 text-accent">
            <MessageSquare className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-muted">{t(locale, "client.today.message")}</div>
            <p className="line-clamp-2 text-[13.5px] text-ink">{lastMsg.body}</p>
          </div>
          <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted rtl:rotate-180" />
        </Link>
      ) : null}
    </div>
  );
}
