import type { ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { tx } from "@/domain/catalog";
import { fmtDate, fmtRelative, fmtSigned } from "@/lib/format";
import { addDays, completion, isSameDay, startOfDay, startOfWeek } from "@/domain/stats";
import type { ClientProfile } from "@/server/client-profile";
import { DayStrip, RingGauge, Sparkline, type DayState } from "@/components/charts";
import { cn } from "@/components/ui";

const num = (x: number) => x.toFixed(1).replace(/\.0$/, "");

/**
 * Stat strip under the profile header, built like the reference "SETS · REPS ·
 * REST" tiles: kicker label, big condensed number, delta chip, then a
 * sparkline / ring / day strip. Weight (+30 d delta), adherence 28 d, momentum,
 * this week, next session. Horizontal scroller on phones, 5 columns on desktop.
 */
export function ProfileStats({ p, locale, nextSession }: { p: ClientProfile; locale: Locale; nextSession: { scheduledFor: Date; workout: { name: string } | null } | null }) {
  const c = p.client;
  const now = new Date();
  const goal = c.goals.find((g) => g.isPrimary) ?? c.goals[0];
  const weights = c.measurements.filter((m) => m.weightKg !== null);
  const last = weights.at(-1) ?? null;
  const ref = last ? ([...weights].reverse().find((m) => m.date <= addDays(last.date, -25)) ?? weights[0]) : null;
  const dKg = last && ref && ref.id !== last.id ? Math.round((last.weightKg! - ref.weightKg!) * 10) / 10 : null;
  const goodDown = goal?.type === "FAT_LOSS";
  const goodUp = goal?.type === "MUSCLE_GAIN";
  const kgGood = dKg === null || dKg === 0 ? null : (dKg < 0 && goodDown) || (dKg > 0 && goodUp) ? true : goodDown || goodUp ? false : null;
  const c28 = completion(p.last28, now);
  const weekStart = startOfWeek(now);
  const weekSessions = c.workoutSessions.filter((x) => x.scheduledFor >= weekStart && x.scheduledFor < addDays(weekStart, 7) && x.status !== "SKIPPED" && x.status !== "RESCHEDULED");
  const weekDone = weekSessions.filter((x) => x.status === "COMPLETED").length;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const s = weekSessions.filter((x) => isSameDay(x.scheduledFor, d));
    let state: DayState = "none";
    if (s.some((x) => x.status === "COMPLETED")) state = "done";
    else if (s.some((x) => x.status === "MISSED" || (x.status === "SCHEDULED" && x.scheduledFor < startOfDay(now)))) state = "missed";
    else if (s.length) state = "planned";
    return { key: d.toISOString(), label: fmtDate(d, locale, { weekday: "short" }).replace(/\.$/, "").slice(0, 3), state, today: isSameDay(d, now), title: s.map((x) => x.workout?.name ?? "").join(", ") };
  });
  const mom = p.momentum.status;
  const momTone = mom === "IMPROVING" ? "text-good" : mom === "DECLINING" ? "text-bad" : "text-ink";
  const momGlyph = mom === "IMPROVING" ? "↑" : mom === "DECLINING" ? "↓" : mom === "STABLE" ? "→" : "–";
  const trendCount = (tr: "UP" | "FLAT" | "DOWN") => p.momentum.dimensions.filter((d) => d.score !== null && d.trend === tr).length;
  const completedWord = tx(locale, "ev.completed").toLowerCase();

  return (
    // Phones: horizontal scroller. lg: 3 columns, the week strip spans 2 (seven 24 px day cells need ~180 px).
    // xl: one row, the week column a bit wider for the same reason.
    <div className="-mx-4 mb-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)_minmax(0,1fr)]">
      <Tile label={t(locale, "client.weight")}>
        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <div className="t-metric flex items-baseline gap-1">
            {last ? num(last.weightKg!) : "–"}
            {last ? <span className="font-sans text-[13px] font-medium text-muted">kg</span> : null}
          </div>
          {weights.length >= 3 ? <Sparkline values={weights.slice(-12).map((m) => m.weightKg)} width={64} height={30} area goodWhen={goodDown ? "down" : goodUp ? "up" : undefined} className="mb-1 shrink-0" /> : null}
        </div>
        {dKg !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11.5px]">
            <span dir="ltr" className={cn("tnum rounded-full px-1.5 py-0.5 font-semibold", kgGood === true ? "bg-good-soft text-good" : kgGood === false ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}>{fmtSigned(dKg, 1, " kg")}</span>
            <span className="text-muted-2">{t(locale, "profile.since30")}</span>
          </div>
        ) : null}
      </Tile>

      <Tile label={t(locale, "clients.adherence")}>
        <div className="flex items-center gap-3">
          <RingGauge value={c28.rate} size={54} stroke={5} tone={c28.rate === null ? "accent" : c28.rate >= 0.75 ? "accent" : c28.rate >= 0.5 ? "warn" : "bad"} label={t(locale, "clients.adherence")}>
            <span className="tnum text-[11.5px] font-bold text-ink">{c28.rate === null ? "–" : `${Math.round(c28.rate * 100)}%`}</span>
          </RingGauge>
          <div className="min-w-0">
            <div className="t-metric">
              {c28.completed}
              <span className="text-[20px] text-muted-2">/{c28.planned}</span>
            </div>
            <div className="t-caption truncate">{completedWord}</div>
          </div>
        </div>
      </Tile>

      <Tile label={t(locale, "client.momentum")}>
        <div className="flex items-center gap-2">
          <span className={cn("t-metric", momTone)} aria-hidden>
            {momGlyph}
          </span>
          <span className="text-[13px] font-semibold leading-4 text-ink-2">{tx(locale, `mom.status.${mom}`)}</span>
        </div>
        {p.momentum.dimensions.length ? (
          <div className="tnum mt-2 flex flex-wrap gap-1 text-[11.5px] font-semibold">
            <span className="rounded-full bg-good-soft px-1.5 py-0.5 text-good" title={t(locale, "trend.UP")}>
              ↑ {trendCount("UP")}
            </span>
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-ink-2" title={t(locale, "trend.FLAT")}>
              → {trendCount("FLAT")}
            </span>
            <span className="rounded-full bg-bad-soft px-1.5 py-0.5 text-bad" title={t(locale, "trend.DOWN")}>
              ↓ {trendCount("DOWN")}
            </span>
          </div>
        ) : null}
      </Tile>

      <Tile label={t(locale, "profile.thisWeek")} className="lg:col-span-2 xl:col-span-1">
        <div className="mb-2 flex items-baseline gap-1.5">
          <span className="t-metric">
            {weekDone}
            <span className="text-[20px] text-muted-2">/{weekSessions.length}</span>
          </span>
          <span className="t-caption truncate">{completedWord}</span>
        </div>
        <DayStrip days={days} size="sm" className="gap-0.5" />
      </Tile>

      <Tile label={t(locale, "clients.nextSession")}>
        {nextSession ? (
          <>
            <div className="tnum font-display text-[22px] font-bold uppercase leading-6 text-ink">{fmtRelative(nextSession.scheduledFor, locale)}</div>
            <div className="t-caption mt-0.5 truncate">{nextSession.workout?.name ?? "—"}</div>
          </>
        ) : (
          <div className="t-metric text-muted-2">—</div>
        )}
        <div className="t-meta mt-auto pt-2">
          {t(locale, "client.checkInDay")}: {t(locale, `day.${c.checkInWeekday}`)}
        </div>
      </Tile>
    </div>
  );
}

function Tile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-[172px] snap-start flex-col rounded-lg border border-border bg-surface px-3.5 py-3 lg:min-w-0", className)}>
      <div className="t-kicker mb-2 truncate">{label}</div>
      {children}
    </div>
  );
}
