import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { Pin } from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { tx } from "@/domain/catalog";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtKg, fmtRelative } from "@/lib/format";
import { isoDate } from "@/domain/stats";
import type { ClientProfile } from "@/server/client-profile";
import { addMeasurementAction } from "@/server/actions/clients";
import { Badge, Button, EmptyState, Field, LinkButton, Panel, PanelHeader, Row, TrendIcon, cn, inputClass } from "@/components/ui";
import { BarStrip, ScoreBar, Sparkline } from "@/components/charts";
import { ActionRow, SignalCard } from "@/components/intelligence";
import { MuscleMap, muscleGroupsOf } from "@/components/muscle-map";
import { CoachBriefing } from "./coach-briefing";
import { BeforeAfterCard } from "./photos";

function SectionTitle({ children, count, className }: { children: ReactNode; count?: number; className?: string }) {
  return (
    <h2 className={cn("t-section mb-2.5 flex items-center gap-2", className)}>
      {children}
      {count ? <span className="tnum rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold tracking-normal text-ink-2">{count}</span> : null}
    </h2>
  );
}

const linkCls = "text-[12.5px] font-semibold text-accent hover:underline";

export function OverviewTab({ p, locale, showAddMeasurement }: { p: ClientProfile; locale: Locale; showAddMeasurement?: boolean }) {
  const c = p.client;
  const goal = c.goals.find((g) => g.isPrimary) ?? c.goals[0];
  const weights = c.measurements.filter((m) => m.weightKg !== null);
  const lastW = weights.at(-1);
  const pinned = c.notes.filter((n) => n.pinned);
  const neg = p.signals.filter((s) => s.polarity === "NEGATIVE");
  const pos = p.signals.filter((s) => s.polarity === "POSITIVE" || s.polarity === "NEUTRAL");
  const goalPct = goal && goal.startValue !== null && goal.targetValue !== null && lastW?.weightKg != null && goal.startValue !== goal.targetValue ? Math.round(Math.max(0, Math.min(100, ((goal.startValue - lastW.weightKg) / (goal.startValue - goal.targetValue)) * 100))) : null;
  const openActions = p.actions.filter((a) => a.kind !== "NO_ACTION").length;
  const progGroups = p.activeProgram ? muscleGroupsOf(p.activeProgram.workouts.flatMap((w) => w.exercises.map((we) => we.exercise))) : [];
  const recentW = weights.slice(-20);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        {/* What matters now */}
        <section>
          <SectionTitle count={openActions}>{t(locale, "client.actions")}</SectionTitle>
          {p.actions.length ? (
            <div className="space-y-1.5">
              {p.actions.map((a) => (
                <ActionRow key={a.id} a={a} locale={locale} clientId={c.id} showReason />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">{t(locale, "client.noSignals")}</p>
          )}
        </section>

        <CoachBriefing clientId={c.id} locale={locale} />

        <section>
          <SectionTitle count={neg.length + pos.length}>{t(locale, "client.signals")}</SectionTitle>
          {neg.length || pos.length ? (
            <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {/* SignalCard carries its own severity start edge; grid stretch keeps paired cards equal height.
                  lg: one column (the main column is only ~340 px next to the side panels on 1024-1279 px screens). */}
              {[...neg, ...pos].map((s) => (
                <SignalCard key={s.id} s={s} locale={locale} decidable />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">{t(locale, "client.noSignals")}</p>
          )}
        </section>

        {/* Drift + friction */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Panel>
            <PanelHeader title={t(locale, "client.drift")} action={<Badge tone={p.drift.verdict === "ON_TRACK" ? "good" : p.drift.verdict === "INSUFFICIENT_DATA" ? "neutral" : p.drift.verdict === "LIFE_FRICTION" ? "info" : "warn"}>{tx(locale, `drift.verdict.${p.drift.verdict}`)}</Badge>} />
            <div className="px-4 pb-4 text-[13px]">
              <p className="text-ink-2">{p.drift.rationale}</p>
              {p.drift.items.length ? (
                <table className="mt-3 w-full text-[12.5px]">
                  <tbody className="divide-y divide-border">
                    {p.drift.items.map((it) => (
                      <tr key={it.aspect} className={cn("align-top", it.material && "text-warn")}>
                        <td className="py-2 pe-2">
                          <span className={cn("text-[11px] font-semibold uppercase tracking-[0.1em]", it.material ? "text-warn" : "text-muted")}>{it.aspect}</span>
                        </td>
                        <td className="py-2 pe-2 text-muted">{it.planned}</td>
                        <td className={cn("py-2 font-medium", it.material ? "text-warn" : "text-ink")}>{it.actual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title={t(locale, "client.friction")} action={p.friction.total ? <span className="tnum font-display text-[20px] font-bold leading-5 text-ink">{p.friction.total}</span> : null} />
            <div className="px-4 pb-4 text-[13px]">
              {p.friction.top.length ? (
                <ul className="space-y-2.5">
                  {p.friction.top.map((f) => (
                    <li key={f.category}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-ink-2">{tx(locale, `friction.${f.category}`)}</span>
                        <span className="tnum text-[12px] text-muted">
                          {f.count} · <span className="font-semibold text-ink">{f.sharePct}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <div className="h-full rounded-full bg-muted" style={{ width: `${Math.max(2, Math.min(100, f.sharePct))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">—</p>
              )}
              {p.friction.pattern ? <p className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-[12.5px] text-warn">{p.friction.pattern}</p> : null}
              <div className="t-kicker mt-3">{t(locale, "client.friction.questions")}</div>
              <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
                {p.friction.questions.map((q) => (
                  <li key={q} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>
      </div>

      {/* Side column: goal, momentum, body, photos, program, pinned notes, contact (two columns on tablets) */}
      <div className="grid min-w-0 content-start items-start gap-4 md:grid-cols-2 lg:grid-cols-1">
        <Panel>
          <PanelHeader title={t(locale, "client.goal")} action={goalPct !== null ? <span className="tnum font-display text-[24px] font-bold leading-6 text-accent">{goalPct}%</span> : null} />
          <div className="px-4 pb-4 text-[13px]">
            {goal ? (
              <>
                <p className="t-card mb-1">{goal.title}</p>
                {goalPct !== null ? <ScoreBar score={goalPct} className="mb-1.5" /> : null}
                <Row label={t(locale, "form.goalType")} value={goal.type} />
                {goal.startValue !== null && goal.targetValue !== null ? <Row label={t(locale, "form.targetWeight")} value={`${goal.startValue} → ${goal.targetValue} kg`} /> : null}
                {goal.targetDate ? <Row label={t(locale, "form.targetDate")} value={fmtDate(goal.targetDate, locale, { day: "numeric", month: "short", year: "numeric" })} /> : null}
              </>
            ) : (
              <p className="text-muted">—</p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={t(locale, "client.momentum")} sub={tx(locale, `mom.status.${p.momentum.status}`)} />
          <div className="px-4 pb-4">
            <p className="mb-3 text-[12.5px] text-muted">{p.momentum.summary}</p>
            <ul className="space-y-2.5">
              {p.momentum.dimensions.map((d) => (
                <li key={d.key} title={d.explanation}>
                  <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                    <TrendIcon trend={d.trend} />
                    {tx(locale, `mom.${d.key}`)}
                  </div>
                  <ScoreBar score={d.score} />
                  <div className="mt-0.5 text-[11.5px] leading-4 text-muted-2">{d.explanation}</div>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title={t(locale, "client.weight")}
            action={
              lastW ? (
                <span className="t-metric flex items-baseline gap-1 text-[24px]! leading-6!">
                  {fmtKg(lastW.weightKg).replace(/ kg$/, "")}
                  <span className="font-sans text-[12px] font-medium text-muted">kg</span>
                </span>
              ) : null
            }
          />
          <div className="px-4 pb-4">
            {weights.length >= 2 ? (
              <>
                <Sparkline values={recentW.map((m) => m.weightKg)} labels={recentW.map((m) => fmtDate(m.date, locale))} width={300} height={64} unit=" kg" area goodWhen={goal?.type === "MUSCLE_GAIN" ? "up" : goal?.type === "FAT_LOSS" ? "down" : undefined} className="w-full" />
                <div className="tnum mt-1 flex justify-between text-[11px] text-muted-2">
                  <span>{fmtDate(recentW[0].date, locale)}</span>
                  <span>{fmtDate(lastW!.date, locale)}</span>
                </div>
              </>
            ) : (
              <EmptyState compact title={t(locale, "client.noMeasurements")} why={t(locale, "client.noMeasurementsWhy")} />
            )}
            <details open={showAddMeasurement} className="mt-3 border-t border-border pt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-[12.5px] font-semibold text-accent sm:min-h-9">{t(locale, "client.addMeasurement")}</summary>
              <ActionForm action={addMeasurementAction} className="mt-2 grid grid-cols-2 gap-2" toast={t(locale, "toast.measurementSaved")}>
                <input type="hidden" name="clientId" value={c.id} />
                <Field label={t(locale, "form.date")} className="col-span-2">
                  <input name="date" type="date" defaultValue={isoDate(new Date())} className={inputClass} required />
                </Field>
                <Field label={t(locale, "form.weight")}>
                  <input name="weightKg" type="number" step="0.1" className={inputClass} inputMode="decimal" />
                </Field>
                <Field label={t(locale, "form.waist")}>
                  <input name="waistCm" type="number" step="0.5" className={inputClass} inputMode="decimal" />
                </Field>
                <Button type="submit" size="sm" className="col-span-2 h-11 sm:h-9">
                  {t(locale, "form.saveMeasurement")}
                </Button>
              </ActionForm>
            </details>
          </div>
        </Panel>

        <BeforeAfterCard p={p} locale={locale} />

        <Panel>
          <PanelHeader
            title={t(locale, "client.program")}
            action={
              p.activeProgram ? (
                <Link href={`/clients/${c.id}?tab=training`} className={linkCls}>
                  {t(locale, "common.open")}
                </Link>
              ) : null
            }
          />
          <div className="px-4 pb-4 text-[13px]">
            {p.activeProgram ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[19px] font-bold uppercase leading-5 text-ink">{p.activeProgram.name}</p>
                    {progGroups.length ? <p className="t-caption mt-1">{progGroups.map((g) => t(locale, `muscle.${g}`)).join(" · ")}</p> : null}
                  </div>
                  {progGroups.length ? <MuscleMap groups={progGroups} view="both" height={64} label={progGroups.map((g) => t(locale, `muscle.${g}`)).join(", ")} /> : null}
                </div>
                <div className="mt-2">
                  <Row label={t(locale, "program.sessionsPerWeek")} value={p.activeProgram.sessionsPerWeek} />
                  <Row label={t(locale, "program.rule")} value={p.activeProgram.progressionRule} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <BarStrip items={p.weekly.map((w, i) => ({ label: `S-${8 - i}`, value: w.rate, hint: `${w.completed}/${w.planned}` }))} width={140} height={28} />
                  <span className="tnum text-[12px] text-muted">
                    {p.last28.filter((s) => s.status === "COMPLETED").length}/{p.last28.filter((s) => s.scheduledFor <= new Date()).length} · {t(locale, "common.days28")}
                  </span>
                </div>
              </>
            ) : (
              <EmptyState
                compact
                title={t(locale, "client.program.none")}
                why={t(locale, "client.program.noneWhy")}
                cta={
                  <LinkButton href={`/clients/${c.id}?tab=training`} size="sm">
                    {t(locale, "client.program.create")}
                  </LinkButton>
                }
              />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title={t(locale, "client.pinnedNotes")}
            action={
              <Link href={`/clients/${c.id}?tab=notes`} className={linkCls}>
                {t(locale, "common.more")}
              </Link>
            }
          />
          <div className="px-4 pb-4">
            {pinned.length ? (
              <ul className="space-y-2 text-[12.5px]">
                {pinned.map((n) => (
                  <li key={n.id} className="flex gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2">
                    <Pin className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="text-ink-2">
                      <span className="me-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{n.category}</span>
                      {n.content}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-muted">{t(locale, "client.noNotes")}</p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={t(locale, "client.contact")} />
          <div className="divide-y divide-border px-4 pb-3 text-[13px]">
            <Row label={t(locale, "form.phone")} value={c.phone ?? "–"} />
            <Row label={t(locale, "form.email")} value={c.email ?? "–"} />
            <Row label={t(locale, "form.locale")} value={c.preferredLocale.toUpperCase()} />
            <Row label={tx(locale, "ev.lastActive")} value={c.lastActiveAt ? fmtRelative(c.lastActiveAt, locale) : "–"} />
            <Row label={t(locale, "client.coach")} value={c.coach.name} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
