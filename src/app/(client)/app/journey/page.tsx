import { Check, Star, Trophy } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import { addDays, daysBetween, startOfDay, startOfWeek } from "@/domain/stats";
import { PageHeader, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const user = await pageUser("client");
  const locale = user.locale;
  const now = new Date();
  const client = await db.client.findUnique({
    where: { id: user.clientId! },
    include: {
      workoutSessions: { where: { scheduledFor: { lt: addDays(startOfDay(now), 1) } }, select: { scheduledFor: true, status: true } },
      milestones: { orderBy: { reachedAt: "asc" } },
      checkIns: { where: { submittedAt: { not: null } }, select: { weekStart: true, weightKg: true } },
      events: { where: { type: { in: ["program.activated", "program.created", "assessment.completed"] } }, orderBy: { occurredAt: "asc" } },
      measurements: { orderBy: { date: "asc" }, select: { date: true, weightKg: true } },
    },
  });
  if (!client) return null;
  const start = startOfWeek(client.onboardedAt);
  const totalWeeks = Math.max(1, Math.floor(daysBetween(start, now) / 7) + 1);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => {
    const from = addDays(start, i * 7);
    const to = addDays(from, 7);
    const sessions = client.workoutSessions.filter((s) => s.scheduledFor >= from && s.scheduledFor < to);
    const done = sessions.filter((s) => s.status === "COMPLETED").length;
    const milestones = client.milestones.filter((m) => m.reachedAt >= from && m.reachedAt < to);
    const events = client.events.filter((e) => e.occurredAt >= from && e.occurredAt < to);
    const w = client.measurements.filter((m) => m.weightKg !== null && m.date >= from && m.date < to).at(-1);
    return { i: i + 1, from, done, planned: sessions.length, milestones, events, weight: w?.weightKg ?? null };
  }).reverse();
  const totalDone = client.workoutSessions.filter((s) => s.status === "COMPLETED").length;
  const firstW = client.measurements.find((m) => m.weightKg !== null)?.weightKg ?? null;
  const lastW = [...client.measurements].reverse().find((m) => m.weightKg !== null)?.weightKg ?? null;

  const tiles = [
    { key: "weeks", value: totalWeeks, label: t(locale, "client.journey.weeks") },
    { key: "sessions", value: totalDone, label: t(locale, "program.workouts") },
    { key: "kg", value: firstW !== null && lastW !== null ? `${lastW - firstW > 0 ? "+" : ""}${(lastW - firstW).toFixed(1)}` : "–", label: "kg" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t(locale, "client.journey.title")} sub={t(locale, "client.journey.sub")} />
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((x) => (
          <div key={x.key} className="rounded-lg border border-border-strong bg-surface px-2 py-3 text-center">
            <div className="t-metric text-ink">{x.value}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{x.label}</div>
          </div>
        ))}
      </div>

      {/* Timeline — newest week first; lime nodes for weeks with training, star for coach highlights */}
      <ol className="relative ms-3 border-s-2 border-border ps-6">
        {weeks.map((w, idx) => {
          const highlight = w.milestones.some((m) => m.highlighted);
          const current = idx === 0;
          const complete = w.done === w.planned && w.planned >= 2;
          return (
            <li key={w.i} className="relative pb-6 last:pb-1">
              <span
                aria-hidden
                className={cn(
                  "absolute -start-[37px] top-0 grid size-6 place-items-center rounded-full ring-4 ring-bg",
                  highlight ? "bg-accent text-accent-ink" : w.done ? "border-2 border-accent bg-accent-soft text-accent" : "border-2 border-border-strong bg-surface-3",
                  current && !highlight && "neon-pulse",
                )}
              >
                {highlight ? <Star className="size-3.5 fill-current" /> : complete ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("font-display text-[18px] font-bold uppercase leading-6 tracking-[0.02em]", current ? "text-accent" : "text-ink")}>
                  {t(locale, "client.journey.week")} {w.i}
                </span>
                <span className="font-display text-[14px] font-semibold uppercase tracking-[0.06em] text-muted">{fmtDate(w.from, locale)}</span>
              </div>
              <div className="mt-1 space-y-0.5 text-[13.5px]">
                {w.i === 1 ? <div className="font-semibold text-ink">{t(locale, "client.journey.started")}</div> : null}
                {w.events.map((e) => (
                  <div key={e.id} className="text-ink-2">
                    {t(locale, `ev.${e.type}`)}
                  </div>
                ))}
                {w.planned || w.weight !== null ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {w.planned ? (
                      <span className={cn("tnum inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold", complete ? "neon-edge bg-accent-soft text-ink" : "border-border-strong bg-surface-2 text-ink-2")}>
                        {w.done}/{w.planned} {t(locale, "program.workouts").toLowerCase()}
                        {complete ? " ✓" : ""}
                      </span>
                    ) : null}
                    {w.weight !== null ? <span className="tnum inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-muted">{w.weight} kg</span> : null}
                  </div>
                ) : null}
                {w.milestones.map((m) => (
                  <div key={m.id} className={cn("mt-2 flex items-start gap-2.5 rounded-lg border px-3 py-2", m.highlighted ? "neon-edge bg-accent-soft" : "border-border bg-surface")}>
                    <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", m.highlighted ? "bg-accent text-accent-ink" : "bg-surface-3 text-accent")}>
                      {m.kind === "PR" ? <Trophy className="size-3.5" /> : <Star className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-[16px] font-bold uppercase leading-5 tracking-[0.02em] text-ink">{m.title}</span>
                      {m.highlighted ? <span className="mt-0.5 block text-[11.5px] text-ink-2">{t(locale, "client.journey.highlight")}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
