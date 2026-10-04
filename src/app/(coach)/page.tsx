import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CalendarX2, CheckCircle2, ChevronRight, ClipboardCheck, Clock, Dumbbell, ListChecks, MessageSquare, RefreshCw, Target, Timer, UserRoundX } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { attentionQueue, todayStats, type QueueItem } from "@/server/queries";
import { ensureFresh } from "@/server/intelligence";
import { recomputeAllAction } from "@/server/actions/intelligence";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtRelative, fmtSigned, greetingKey } from "@/lib/format";
import { Button, CtaArrow, EmptyState, LinkButton, buttonClass, cn } from "@/components/ui";
import { RingGauge, Sparkline } from "@/components/charts";
import { HeroCard, StatCard } from "@/components/stat-card";
import { ActionForm } from "@/components/action-form";
import { QueueRow } from "@/components/intelligence";
import { MuscleMap, muscleGroupsOf } from "@/components/muscle-map";

export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  const user = await pageUser("staff");
  const locale = user.locale;
  await ensureFresh(user.orgId, locale);
  const [stats, queue] = await Promise.all([todayStats(user.orgId, user.id), attentionQueue(user.orgId)]);
  const now = new Date();

  // First-run onboarding checklist (only while the workspace is empty-ish)
  const onboarding = stats.clientCount < 1 ? await onboardingState(user.orgId) : null;

  const groups: { key: "URGENT" | "ATTENTION" | "WATCH" | "POSITIVE"; items: QueueItem[]; tone: "bad" | "warn" | "info" | "good" }[] = [
    { key: "URGENT", tone: "bad", items: queue.filter((q) => q.maxSeverity === "URGENT") },
    { key: "ATTENTION", tone: "warn", items: queue.filter((q) => q.maxSeverity === "ATTENTION") },
    { key: "WATCH", tone: "info", items: queue.filter((q) => q.maxSeverity === "WATCH") },
    { key: "POSITIVE", tone: "good", items: queue.filter((q) => q.maxSeverity === "INFO") },
  ];
  const pendingTotal = stats.pendingCheckins + stats.unanswered;
  const next = stats.nextSession;
  const total = stats.sessionsToday.length;
  const adh = stats.adherence14;
  const adhPct = adh === null ? null : Math.round(adh * 100);
  const adhDelta = adh !== null && stats.adherencePrev14 !== null ? Math.round((adh - stats.adherencePrev14) * 100) : null;
  const missedDelta = stats.missed7 - stats.missedPrev7;
  const firstName = user.name.split(" ")[0];
  const muscles = muscleGroupsOf(next?.workout?.exercises.map((we) => we.exercise) ?? []);
  const muscleNames = muscles.map((g) => t(locale, `muscle.${g}`));
  const exerciseCount = next?.workout?.exercises.length ?? 0;
  const vsPrev = t(locale, "cc.vsPrev");

  return (
    <div className="mx-auto max-w-6xl">
      {/* Greeting — "WELCOME BACK, / WARRIOR" */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0">
            <span className="t-kicker block">{t(locale, greetingKey(now))},</span>
            <span className="t-display text-glow mt-1.5 block break-words text-accent">{firstName}</span>
          </h1>
          <p className="t-caption mt-2">
            {t(locale, "cc.today")} · {fmtDate(now, locale, { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <ActionForm action={recomputeAllAction} className="flex items-center gap-2 text-[12px] text-muted" toast={t(locale, "toast.updated")}>
          {stats.signalsComputedAt ? (
            <span className="hidden sm:inline">
              {t(locale, "cc.computedAt")} {fmtRelative(stats.signalsComputedAt, locale)}
            </span>
          ) : null}
          <Button variant="outline" size="md" type="submit" className="h-11" aria-label={t(locale, "cc.recompute")} title={t(locale, "cc.recompute")}>
            <RefreshCw className="size-4" />
            <span className="hidden sm:inline">{t(locale, "cc.recompute")}</span>
          </Button>
        </ActionForm>
      </div>

      {onboarding ? (
        <section className="neon-edge mb-5 rounded-lg border bg-accent-soft/40 px-4 py-4">
          <h2 className="font-display text-[20px] font-bold uppercase leading-6 tracking-[0.02em] text-ink">{t(locale, "cc.onboarding.title")}</h2>
          <p className="t-caption mt-1">{t(locale, "cc.onboarding.sub")}</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-4">
            {onboarding.steps.map((s, i) => (
              <li key={s.key} className={cn("flex min-h-[48px] items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]", s.done ? "border-good/40 bg-good-soft" : "border-border bg-surface")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-md font-display text-[14px] font-bold", s.done ? "bg-good text-bg" : "border border-border-strong bg-surface-2 text-muted")}>{s.done ? "✓" : i + 1}</span>
                {s.href && !s.done ? (
                  <Link href={s.href} className="font-medium text-ink hover:underline">
                    {t(locale, s.key)}
                  </Link>
                ) : (
                  <span className={cn(s.done && "text-muted line-through")}>{t(locale, s.key)}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* NEXT SESSION (hero, "TODAY'S PLAN") · PENDING */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HeroCard className="lg:col-span-2" aria-labelledby="next">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="next" className="t-kicker">
                {t(locale, "clients.nextSession")}
              </h2>
              {next ? (
                <Link href={`/clients/${next.client.id}`} className="t-title mt-2 block truncate text-ink hover:underline">
                  {next.client.firstName} {next.client.lastName}
                </Link>
              ) : (
                <p className="t-caption mt-2">{t(locale, "cc.nothingNext")}</p>
              )}
            </div>
            <RingGauge value={total ? stats.completedToday / total : null} size={72} stroke={6} label={t(locale, "cc.sessionsToday")}>
              <span className="tnum block font-display text-[19px] font-bold leading-none text-ink">
                {stats.completedToday}/{total}
              </span>
              <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{t(locale, "common.done")}</span>
            </RingGauge>
          </div>

          {next ? (
            <>
              <div className="mt-3 flex items-end justify-between gap-3">
                <ul className="min-w-0 flex-1 space-y-2 text-[13px] text-ink-2">
                  <MetaRow icon={Dumbbell}>
                    <span className="font-semibold text-ink">{next.workout?.name ?? "—"}</span>
                  </MetaRow>
                  <MetaRow icon={Clock}>{fmtDate(next.scheduledFor, locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</MetaRow>
                  <MetaRow icon={Timer}>
                    <bdi dir="ltr">~{next.workout?.estimatedMinutes ?? "–"}</bdi> {t(locale, "common.min")}
                    {exerciseCount ? ` · ${exerciseCount} ${t(locale, "program.exercises").toLowerCase()}` : ""}
                  </MetaRow>
                  {muscleNames.length ? (
                    <MetaRow icon={Target}>
                      <span className="sr-only">{t(locale, "cc.muscles")}: </span>
                      {muscleNames.join(" · ")}
                    </MetaRow>
                  ) : null}
                </ul>
                {muscles.length ? <MuscleMap groups={muscles} view="both" height={124} label={`${t(locale, "cc.muscles")}: ${muscleNames.join(", ")}`} className="-mb-1" /> : null}
              </div>
              <Link href={`/clients/${next.client.id}/train/${next.id}`} className={buttonClass("neon", "lg", "press mt-4 h-[52px] w-full justify-between pe-2.5 ps-5")}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Dumbbell className="size-[18px] shrink-0" />
                  <span className="truncate">{t(locale, "cc.startWorkout")}</span>
                </span>
                <CtaArrow />
              </Link>
              {total > 1 ? (
                <Link href="/agenda" className="mx-auto mt-2 flex min-h-[40px] w-fit items-center gap-1 px-2 text-[12.5px] font-medium text-ink-2 hover:text-accent">
                  <span className="tnum font-display text-[15px] font-bold text-ink">{total}</span> {t(locale, "cc.sessionsToday").toLowerCase()}
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </Link>
              ) : null}
            </>
          ) : null}
        </HeroCard>

        <section aria-labelledby="pending" className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="pending" className="t-kicker">
              {t(locale, "cc.pending")}
            </h2>
            {pendingTotal ? <span className="tnum rounded-md border border-warn/30 bg-warn-soft px-2 font-display text-[16px] font-bold leading-6 text-warn">{pendingTotal}</span> : null}
          </div>
          <ul className="space-y-2">
            <PendingRow href="/review" icon={ClipboardCheck} count={stats.pendingCheckins} label={t(locale, "cc.pendingCheckins.item")} names={stats.pendingCheckinsList.map((c) => c.client.firstName)} />
            <PendingRow href="/messages" icon={MessageSquare} count={stats.unanswered} label={t(locale, "cc.pendingMessages.item")} names={stats.unansweredList.map((m) => m.client.firstName)} />
            <PendingRow href="/clients?filter=attention" icon={ListChecks} count={stats.clientsAttention} label={t(locale, "cc.pendingActions.item")} />
          </ul>
        </section>
      </div>

      {/* KPIs — phones: one "weekly progress" card (big adherence ring + stat rows); md+: four stat tiles */}
      <section aria-labelledby="kpis" className="mb-4 rounded-lg border border-border bg-surface p-4 md:hidden">
        <h2 id="kpis" className="t-kicker">
          {t(locale, "cc.kpis")}
        </h2>
        <div className="mt-3 flex items-center gap-4">
          <Link href="/analytics" className="press flex w-[120px] shrink-0 flex-col items-center gap-1.5 rounded-md py-1 text-center">
            <RingGauge value={adh} size={112} stroke={9} label={t(locale, "cc.adherence14")}>
              <span className="t-metric block text-ink">{adhPct === null ? "–" : `${adhPct}%`}</span>
            </RingGauge>
            <span className="text-[12px] font-medium text-ink-2">{t(locale, "cc.adherence14")}</span>
            {adhDelta !== null ? <DeltaChip text={fmtSigned(adhDelta, 0, " pts")} good={adhDelta > 0 ? true : adhDelta < 0 ? false : null} sr={vsPrev} /> : null}
            {/* 8-week trend (same data as the md+ stat tile) */}
            <Sparkline values={stats.weeklyRates} width={88} height={22} goodWhen="up" area className="mt-0.5" />
          </Link>
          <ul className="min-w-0 flex-1 divide-y divide-border">
            <KpiLine href="/agenda" icon={Dumbbell} label={t(locale, "cc.sessionsToday")} value={`${stats.completedToday}/${total}`} />
            <KpiLine href="/clients?filter=attention" icon={CalendarX2} label={t(locale, "cc.missedWeek")} value={stats.missed7} tone={stats.missed7 ? "warn" : undefined} delta={<DeltaChip text={fmtSigned(missedDelta, 0)} good={missedDelta < 0 ? true : missedDelta > 0 ? false : null} sr={vsPrev} />} />
            <KpiLine href="/clients?filter=attention" icon={UserRoundX} label={t(locale, "cc.clientsAttention")} value={stats.clientsAttention} tone={stats.clientsAttention ? "bad" : "good"} hint={`${stats.plansAttention} ${t(locale, "cc.plansAttention").toLowerCase()}`} />
          </ul>
        </div>
      </section>
      <div className="mb-4 hidden gap-3 md:grid md:grid-cols-4">
        <StatCard label={t(locale, "cc.sessionsToday")} value={`${stats.completedToday}/${total}`} ring={total ? stats.completedToday / total : null} ringTone={total && stats.completedToday === total ? "good" : "accent"} href="/agenda" />
        <StatCard label={t(locale, "cc.missedWeek")} value={stats.missed7} tone={stats.missed7 ? "warn" : "neutral"} delta={{ text: fmtSigned(missedDelta, 0), good: missedDelta < 0 ? true : missedDelta > 0 ? false : null }} deltaLabel={vsPrev} href="/clients?filter=attention" />
        <StatCard label={t(locale, "cc.adherence14")} value={adhPct === null ? "–" : `${adhPct}%`} delta={adhDelta === null ? null : { text: fmtSigned(adhDelta, 0, " pts"), good: adhDelta > 0 ? true : adhDelta < 0 ? false : null }} deltaLabel={vsPrev} spark={stats.weeklyRates} sparkGood="up" href="/analytics" />
        <StatCard label={t(locale, "cc.clientsAttention")} value={stats.clientsAttention} tone={stats.clientsAttention ? "bad" : "good"} hint={`${stats.plansAttention} ${t(locale, "cc.plansAttention").toLowerCase()}`} href="/clients?filter=attention" />
      </div>

      {/* DONE TODAY — a slim strip of chips */}
      <section aria-labelledby="done" className="mb-7 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3">
        <h2 id="done" className="t-kicker flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-good" />
          {t(locale, "cc.completedSection")}
          <span className="tnum font-display text-[16px] font-bold leading-none tracking-normal text-good">{stats.completedToday + stats.actionsDoneToday}</span>
        </h2>
        {stats.completedTodayList.length || stats.actionsDoneToday ? (
          <ul className="flex flex-wrap gap-1.5 text-[12.5px]">
            {stats.completedTodayList.slice(0, 6).map((s) => (
              <li key={s.id}>
                <Link href={`/clients/${s.client.id}?tab=training`} className="press inline-flex min-h-8 items-center gap-1.5 rounded-full border border-good/25 bg-good-soft px-2.5 py-1 font-medium text-good hover:border-good/50">
                  <CheckCircle2 className="size-3.5" />
                  {s.client.firstName} <span className="font-normal text-ink-2">· {s.workout?.name}</span>
                </Link>
              </li>
            ))}
            {stats.actionsDoneToday ? (
              <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-ink-2">
                <CheckCircle2 className="size-3.5 text-good" />
                <span className="tnum font-semibold text-ink">{stats.actionsDoneToday}</span> {t(locale, "client.actions").toLowerCase()}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="t-caption">{t(locale, "cc.nothingDone")}</p>
        )}
      </section>

      {/* ATTENTION QUEUE */}
      <section aria-labelledby="queue">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="queue" className="font-display text-[24px] font-bold uppercase leading-7 tracking-[0.02em] text-ink">
              {t(locale, "cc.queue")}
            </h2>
            <p className="t-caption mt-0.5">{t(locale, "cc.queue.sub")}</p>
          </div>
          <span className="tnum grid h-9 min-w-9 place-items-center rounded-md border border-border-strong bg-surface-2 px-2 font-display text-[18px] font-bold text-ink">{queue.length}</span>
        </div>
        {queue.length ? (
          <div className="space-y-5">
            {groups
              .filter((g) => g.items.length)
              .map((g) => (
                <div key={g.key}>
                  <h3 className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em]">
                    <span className={cn("size-2 rounded-full", g.tone === "bad" ? "bg-bad" : g.tone === "warn" ? "bg-warn" : g.tone === "info" ? "bg-info" : "bg-good")} />
                    <span className={g.tone === "bad" ? "text-bad" : g.tone === "warn" ? "text-warn" : g.tone === "info" ? "text-info" : "text-good"}>{t(locale, `cc.group.${g.key}`)}</span>
                    <span className="tnum font-display text-[14px] tracking-normal text-muted">{g.items.length}</span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </h3>
                  <ul className="enter-stagger space-y-2.5">
                    {g.items.map((item) => (
                      <QueueRow key={item.client.id} item={item} locale={locale} />
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState
            title={t(locale, "cc.queue.empty")}
            cta={
              <LinkButton href="/clients" variant="outline" size="sm">
                {t(locale, "cc.queue.emptyCta")}
              </LinkButton>
            }
          />
        )}
      </section>
    </div>
  );
}

function MetaRow({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent-soft text-accent">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

function DeltaChip({ text, good, sr }: { text: string; good: boolean | null; sr?: string }) {
  return (
    <span className={cn("tnum inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none", good === true ? "bg-good-soft text-good" : good === false ? "bg-bad-soft text-bad" : "bg-surface-2 text-ink-2")} title={sr}>
      <bdi dir="ltr">{text}</bdi>
      {sr ? <span className="sr-only"> {sr}</span> : null}
    </span>
  );
}

function KpiLine({ href, icon: Icon, label, value, tone, delta, hint }: { href: string; icon: ComponentType<{ className?: string }>; label: string; value: ReactNode; tone?: "good" | "warn" | "bad"; delta?: ReactNode; hint?: string }) {
  return (
    <li>
      <Link href={href} className="press -mx-1 flex min-h-[56px] items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-surface-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-accent">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] leading-4 text-muted">{label}</span>
          <span className="flex items-center gap-1.5">
            <span className={cn("tnum font-display text-[22px] font-bold leading-6", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink")}>{value}</span>
            {delta}
          </span>
          {hint ? <span className="block truncate text-[12px] leading-4 text-muted-2">{hint}</span> : null}
        </span>
      </Link>
    </li>
  );
}

function PendingRow({ href, icon: Icon, count, label, names }: { href: string; icon: ComponentType<{ className?: string }>; count: number; label: string; names?: string[] }) {
  return (
    <li>
      <Link href={href} className={cn("press flex min-h-[52px] items-center gap-3 rounded-md border border-border bg-surface-2/50 px-3 py-1.5 hover:border-border-strong hover:bg-surface-2", !count && "text-muted")}>
        <span className={cn("tnum grid h-9 min-w-9 shrink-0 place-items-center rounded-md border px-1 font-display text-[18px] font-bold leading-none", count ? "border-warn/30 bg-warn-soft text-warn" : "border-border bg-surface text-muted-2")}>{count}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
            <Icon className="size-3.5 shrink-0 text-muted" />
            <span className="truncate">{label}</span>
          </span>
          {names?.length ? <span className="t-caption block truncate">{names.slice(0, 4).join(", ")}</span> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-2 rtl:rotate-180" />
      </Link>
    </li>
  );
}

async function onboardingState(orgId: string) {
  const [clients, goals, programs, sessions] = await Promise.all([
    db.client.count({ where: { orgId } }),
    db.goal.count({ where: { client: { orgId } } }),
    db.program.count({ where: { client: { orgId } } }),
    db.workoutSession.count({ where: { client: { orgId }, status: "COMPLETED" } }),
  ]);
  return {
    steps: [
      { key: "cc.onboarding.step1", done: clients > 0, href: "/clients/new" },
      { key: "cc.onboarding.step2", done: goals > 0, href: "/clients/new" },
      { key: "cc.onboarding.step3", done: programs > 0, href: "/clients" },
      { key: "cc.onboarding.step4", done: sessions > 0, href: "/agenda" },
    ],
  };
}
