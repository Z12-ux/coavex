import { ActionForm } from "@/components/action-form";
import { CalendarDays, Check, Clock, Layers, ListChecks, Repeat, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { FRICTION_CATEGORIES } from "@/domain/types";
import { tx } from "@/domain/catalog";
import { PROGRAM_TEMPLATES } from "@/domain/templates";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import { isoDate, e1rm, round } from "@/domain/stats";
import type { ClientProfile } from "@/server/client-profile";
import { activateProgramAction, createProgramFromTemplateAction, rescheduleSessionAction, scheduleWeekAction, setSessionStatusAction, substituteExerciseAction, updateExerciseLoadAction } from "@/server/actions/programs";
import { Badge, Button, CtaArrow, EmptyState, Field, LinkButton, Panel, PanelHeader, cn, inputClass, selectClass } from "@/components/ui";
import { HeroCard } from "@/components/stat-card";
import { MuscleMap, muscleGroupsOf } from "@/components/muscle-map";

type Program = NonNullable<ClientProfile["activeProgram"]>;
type Workout = Program["workouts"][number];
type Session = ClientProfile["client"]["workoutSessions"][number];

/** Focus label (LOWER → "Bas du corps"), raw value when no translation exists. */
function focusLabel(locale: Locale, focus: string) {
  const key = `workout.focus.${focus}`;
  const v = t(locale, key);
  return v === key ? focus : v;
}

/** Small uppercase label that can take a colour (`.t-kicker` is unlayered and would win over colour utilities). */
const KICK = "text-[11.5px] font-semibold uppercase leading-[14px] tracking-[0.16em]";

export function TrainingTab({ p, locale, nextSessionId }: { p: ClientProfile; locale: Locale; nextSessionId?: string | null }) {
  const c = p.client;
  const prog = p.activeProgram;
  const drafts = c.programs.filter((x) => x.status === "DRAFT");
  const now = new Date();
  const sessions = c.workoutSessions;
  const upcoming = sessions.filter((s) => s.status === "SCHEDULED" && s.scheduledFor >= now).slice(-6).reverse();
  const past = sessions.filter((s) => s.scheduledFor < now).slice(0, 24);
  const nextSession = nextSessionId ? sessions.find((s) => s.id === nextSessionId) : null;
  const nextWorkout = nextSession && prog ? (prog.workouts.find((w) => w.id === nextSession.workout?.id) ?? null) : null;
  const nextGroups = nextWorkout ? muscleGroupsOf(nextWorkout.exercises.map((we) => we.exercise)) : [];
  // first scheduled session of each workout (same window as the profile's "next session") → start link on its card
  const nextByWorkout = new Map<string, Session>();
  for (const s of [...sessions].filter((x) => x.status === "SCHEDULED" && x.scheduledFor >= new Date(now.getTime() - 86_400_000)).sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())) {
    if (s.workout && !nextByWorkout.has(s.workout.id)) nextByWorkout.set(s.workout.id, s);
  }
  const groupNames = (gs: readonly string[]) => gs.map((g) => t(locale, `muscle.${g}`));

  return (
    <div className="space-y-6">
      {nextSession ? (
        <HeroCard aria-label={t(locale, "cc.next")}>
          <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
            {/* map + text never wrap apart (phones too): the muscles lit in lime are the point of this card */}
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {nextGroups.length ? <MuscleMap groups={nextGroups} view="both" height={92} label={groupNames(nextGroups).join(", ")} /> : null}
              <div className="min-w-0 flex-1">
                <p className={cn(KICK, "text-accent")}>{t(locale, "cc.next")}</p>
                <h2 className="t-title mt-1 truncate">{nextSession.workout?.name ?? "—"}</h2>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
                  <Meta icon={<CalendarDays className="size-3.5" />}>{fmtDate(nextSession.scheduledFor, locale, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Meta>
                  {nextWorkout ? (
                    <>
                      <Meta icon={<Clock className="size-3.5" />}>
                        {nextWorkout.estimatedMinutes} {t(locale, "common.min")}
                      </Meta>
                      <Meta icon={<ListChecks className="size-3.5" />}>
                        {nextWorkout.exercises.length} {t(locale, "program.exercises").toLowerCase()}
                      </Meta>
                      <Meta icon={<Layers className="size-3.5" />}>
                        {nextWorkout.exercises.reduce((a, we) => a + we.sets, 0)} {t(locale, "workout.sets").toLowerCase()}
                      </Meta>
                    </>
                  ) : null}
                </ul>
                {nextGroups.length ? (
                  <p className="t-caption mt-1.5">
                    {t(locale, "workout.musclesTargeted")} · {groupNames(nextGroups).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
            <LinkButton href={`/clients/${c.id}/train/${nextSession.id}`} size="lg" className="press w-full justify-between gap-3 pe-2 sm:w-auto">
              {t(locale, "client.startSession")}
              <CtaArrow />
            </LinkButton>
          </div>
        </HeroCard>
      ) : null}

      {p.deload?.recommended ? (
        <div className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13px]">
          <div className={cn(KICK, "text-warn")}>{t(locale, "program.deloadSuggest")}</div>
          <ul className="mt-1.5 space-y-0.5 text-ink-2">
            {p.deload.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.missedOptions.size ? (
        <Panel>
          <PanelHeader title={t(locale, "client.today.missed")} sub={t(locale, "client.today.missedWhy")} />
          <div className="space-y-3 px-4 pb-4">
            {[...p.missedOptions.entries()].map(([sessionId, opts]) => {
              const s = sessions.find((x) => x.id === sessionId);
              return (
                <div key={sessionId} className="rounded-md border border-border bg-surface-2 p-3 text-[13px]">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <span className="font-display text-[17px] font-bold uppercase leading-5">{s?.workout?.name ?? "—"}</span>
                    <span className="text-muted">{s ? fmtDate(s.scheduledFor, locale, { weekday: "long", day: "numeric", month: "short" }) : ""}</span>
                    {s?.missedReason ? <Badge tone="neutral">{tx(locale, `friction.${s.missedReason}`)}</Badge> : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {opts.map((o) => (
                      <ActionForm key={o.kind} action={o.kind === "MOVE" ? rescheduleSessionAction : setSessionStatusAction} toast={t(locale, "toast.updated")} className={cn("flex flex-col rounded-md border bg-surface p-3", o.recommended ? "neon-edge" : "border-border")}>
                        <input type="hidden" name="sessionId" value={sessionId} />
                        {o.kind === "MOVE" ? <input type="hidden" name="date" value={isoDate(new Date(now.getTime() + 86_400_000))} /> : null}
                        {o.kind === "SKIP" ? <input type="hidden" name="status" value="SKIPPED" /> : null}
                        {o.kind === "COMPRESS" ? <input type="hidden" name="status" value="SCHEDULED" /> : null}
                        {o.kind === "COACH_REVIEW" ? <input type="hidden" name="status" value="MISSED" /> : null}
                        <div className="flex items-center gap-1.5 font-semibold text-ink">
                          {o.title} {o.recommended ? <Badge tone="accent">★</Badge> : null}
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-muted">{o.detail}</div>
                        {o.kind !== "COACH_REVIEW" ? (
                          <Button size="sm" variant={o.recommended ? "primary" : "outline"} className="mt-2.5 h-11 self-start sm:h-9" type="submit">
                            {t(locale, "common.confirm")}
                          </Button>
                        ) : null}
                      </ActionForm>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {prog ? (
        <section aria-labelledby="program-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="t-kicker">{t(locale, "client.program")}</p>
              <h2 id="program-title" className="t-title mt-1">
                {prog.name}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                <Chip>
                  <span className="tnum font-semibold text-ink">{prog.sessionsPerWeek}</span> {t(locale, "program.sessionsPerWeek").toLowerCase()}
                </Chip>
                <Chip>{prog.progressionRule}</Chip>
                <Chip>
                  {t(locale, "program.deload")}: <span className="tnum font-semibold text-ink">{prog.deloadEveryWeeks ?? "–"}</span> {t(locale, "program.weeksShort")}
                </Chip>
                <Chip>
                  <CalendarDays className="size-3.5" aria-hidden /> {fmtDate(prog.startDate, locale)}
                </Chip>
              </div>
            </div>
            <ActionForm action={scheduleWeekAction} toast={t(locale, "toast.scheduled")}>
              <input type="hidden" name="programId" value={prog.id} />
              <Button size="md" variant="outline" type="submit">
                <CalendarDays className="size-4" />
                {t(locale, "program.schedule")}
              </Button>
            </ActionForm>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {prog.workouts.map((w) => (
              <WorkoutCard key={w.id} w={w} p={p} locale={locale} clientId={c.id} next={nextByWorkout.get(w.id) ?? null} />
            ))}
          </div>
        </section>
      ) : (
        <Panel>
          <PanelHeader title={t(locale, "client.program.none")} sub={t(locale, "client.program.noneWhy")} />
          <div className="px-4 pb-4">
            {drafts.length ? (
              <ul className="mb-4 divide-y divide-border rounded-md border border-border bg-surface-2">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                    <span className="font-display text-[16px] font-bold uppercase">{d.name}</span>
                    <ActionForm action={activateProgramAction}>
                      <input type="hidden" name="programId" value={d.id} />
                      <Button size="sm" className="h-11 sm:h-9">
                        {t(locale, "program.activate")}
                      </Button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm action={createProgramFromTemplateAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="clientId" value={c.id} />
              <input type="hidden" name="activate" value="1" />
              <Field label={t(locale, "program.template")}>
                <select name="template" className={selectClass} defaultValue="FB3">
                  {PROGRAM_TEMPLATES.map((tp) => (
                    <option key={tp.key} value={tp.key}>
                      {tp.name} — {tp.description}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(locale, "program.name")}>
                <input name="name" className={inputClass} placeholder={`… — ${c.firstName}`} />
              </Field>
              <Button type="submit" className="h-11">
                {t(locale, "client.program.create")}
              </Button>
            </ActionForm>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel>
          <PanelHeader title={t(locale, "client.sessionsHistory")} />
          <div className="px-4 pb-3">
            {past.length ? (
              <ul className="divide-y divide-border">
                {past.map((s) => {
                  const overdue = s.status === "SCHEDULED";
                  return (
                    <li key={s.id} className="flex gap-3 py-3 text-[13px]">
                      <DateTile d={s.scheduledFor} locale={locale} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{s.workout?.name ?? "—"}</span>
                          <Badge tone={s.status === "COMPLETED" ? "good" : s.status === "MISSED" || overdue ? "bad" : "neutral"}>{overdue ? "MISSED?" : s.status}</Badge>
                          {s.sessionRpe ? <span className="tnum text-[12px] text-muted">RPE {s.sessionRpe}</span> : null}
                          {s.isShortened ? <Badge tone="warn">30′</Badge> : null}
                          {s.missedReason ? <span className="text-[12px] text-muted">{tx(locale, `friction.${s.missedReason}`)}</span> : null}
                        </div>
                        {s.sets.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {groupSets(s.sets).map((g) => (
                              <span key={g.name} className={cn("tnum rounded-md px-2 py-0.5 text-[12px]", g.pr ? "bg-good-soft font-medium text-good" : "bg-surface-2 text-ink-2")}>
                                {g.name}: {g.summary}
                                {g.pr ? " ★" : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {s.clientNote ? <div className="mt-1 text-[12.5px] italic text-muted">« {s.clientNote} »</div> : null}
                        {overdue ? (
                          <ActionForm action={setSessionStatusAction} className="mt-2 flex flex-wrap items-center gap-1.5" toast={t(locale, "toast.updated")}>
                            <input type="hidden" name="sessionId" value={s.id} />
                            <select name="missedReason" className={cn(selectClass, "h-11 w-auto text-[12.5px] sm:h-9")} defaultValue="" aria-label={t(locale, "client.today.missedWhy")}>
                              <option value="">{t(locale, "client.today.missedWhy")}</option>
                              {FRICTION_CATEGORIES.map((f) => (
                                <option key={f} value={f}>
                                  {tx(locale, `friction.${f}`)}
                                </option>
                              ))}
                            </select>
                            <Button name="status" value="COMPLETED" size="sm" variant="outline" className="h-11 sm:h-9">
                              ✓ {t(locale, "common.done")}
                            </Button>
                            <Button name="status" value="MISSED" size="sm" variant="ghost" className="h-11 sm:h-9">
                              ✗ {t(locale, "client.today.missed")}
                            </Button>
                          </ActionForm>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact title={t(locale, "agenda.empty")} />
            )}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel>
            <PanelHeader title={t(locale, "clients.nextSession")} />
            <div className="px-4 pb-3">
              {upcoming.length ? (
                <ul className="divide-y divide-border text-[13px]">
                  {upcoming.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <DateTile d={s.scheduledFor} locale={locale} compact />
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{s.workout?.name ?? "—"}</span>
                      {s.id === nextSessionId ? <Badge tone="accent">{t(locale, "cc.next")}</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pb-1 text-[13px] text-muted">—</p>
              )}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title={t(locale, "client.prs")} action={p.prs.length ? <Trophy className="size-4 text-accent" aria-hidden /> : null} />
            <div className="px-4 pb-3">
              {p.prs.length ? (
                <ul className="divide-y divide-border text-[13px]">
                  {p.prs.map((pr) => (
                    <li key={pr.exerciseId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-ink-2">{pr.name}</span>
                      <span className="shrink-0 text-end">
                        <span className="tnum font-display text-[17px] font-bold text-ink">
                          {pr.weightKg} kg × {pr.reps}
                        </span>
                        <span className="tnum block text-[12px] text-muted">~{round(pr.e1rm, 0)} kg</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pb-1 text-[13px] text-muted">—</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── pieces ───────────────────────────────────────

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="tnum flex items-center gap-1.5">
      <span className="text-muted" aria-hidden>
        {icon}
      </span>
      {children}
    </li>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-ink-2">{children}</span>;
}

/** Condensed day tile for session lists: weekday · day number · month. */
function DateTile({ d, locale, compact }: { d: Date; locale: Locale; compact?: boolean }) {
  return (
    <div className={cn("flex shrink-0 flex-col items-center justify-center rounded-md border border-border bg-surface-2 text-center", compact ? "h-11 w-11" : "h-14 w-12")}>
      <span className="text-[11px] font-semibold uppercase leading-3 text-muted">{fmtDate(d, locale, { weekday: "short" }).replace(/\.$/, "")}</span>
      <span className={cn("tnum font-display font-bold leading-none text-ink", compact ? "text-[18px]" : "text-[22px]")}>{fmtDate(d, locale, { day: "numeric" })}</span>
      {compact ? null : <span className="text-[11px] leading-3 text-muted">{fmtDate(d, locale, { month: "short" }).replace(/\.$/, "")}</span>}
    </div>
  );
}

/** Reference "SETS · REPS · REST" tile. */
function Spec({ label, value, extra }: { label: string; value: ReactNode; extra?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border-strong bg-surface-2 px-1.5 py-1.5 text-center">
      <dt className="truncate text-[11px] font-semibold uppercase leading-[13px] tracking-[0.08em] text-muted">{label}</dt>
      <dd className="tnum mt-0.5 font-display text-[20px] font-bold leading-6 text-ink">
        {value}
        {extra ? <span className="ms-0.5 font-sans text-[11px] font-medium text-muted">{extra}</span> : null}
      </dd>
    </div>
  );
}

function WorkoutCard({ w, p, locale, clientId, next }: { w: Workout; p: ClientProfile; locale: Locale; clientId: string; next: Session | null }) {
  const groups = muscleGroupsOf(w.exercises.map((we) => we.exercise));
  const names = groups.map((g) => t(locale, `muscle.${g}`));
  const totalSets = w.exercises.reduce((a, we) => a + we.sets, 0);
  return (
    <Panel as="article" className="flex flex-col overflow-hidden">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          {w.focus ? <p className="t-kicker">{focusLabel(locale, w.focus)}</p> : null}
          <h3 className="mt-0.5 font-display text-[24px] font-bold uppercase leading-[26px] text-ink">{w.name}</h3>
          <ul className="mt-2.5 space-y-1 text-[12.5px] text-ink-2">
            <Meta icon={<Clock className="size-3.5" />}>
              {w.estimatedMinutes} {t(locale, "common.min")}
            </Meta>
            <Meta icon={<ListChecks className="size-3.5" />}>
              {w.exercises.length} {t(locale, "program.exercises").toLowerCase()}
            </Meta>
            <Meta icon={<Layers className="size-3.5" />}>
              {totalSets} {t(locale, "workout.sets").toLowerCase()}
            </Meta>
          </ul>
        </div>
        {groups.length ? <MuscleMap groups={groups} view="both" height={76} label={`${t(locale, "workout.musclesTargeted")}: ${names.join(", ")}`} /> : null}
      </header>
      {names.length ? (
        <div className="flex flex-wrap gap-1 px-4 pt-3">
          {names.map((n) => (
            <span key={n} className="rounded-full border border-border-strong px-2 py-0.5 text-[11.5px] font-medium text-ink-2">
              {n}
            </span>
          ))}
        </div>
      ) : null}
      <ol className="divide-y divide-border">
        {w.exercises.map((we) => {
          const sug = p.suggestions.get(we.id);
          const subs = p.substitutes.get(we.exercise.id) ?? [];
          const hasSug = !!sug && sug.change !== "KEEP" && sug.nextLoadKg !== null && sug.nextLoadKg !== we.startLoadKg;
          return (
            <li key={we.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[13.5px] font-semibold leading-5 text-ink">
                  {we.exercise.name}
                  {we.exercise.isMainLift ? <span className="ms-1 text-accent">★</span> : null}
                </span>
                <span className="shrink-0 text-[12px] text-muted">{t(locale, `muscle.${we.exercise.muscleGroup}`)}</span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-1.5">
                <Spec label={t(locale, "workout.sets")} value={we.sets} />
                <Spec label={t(locale, "client.workout.reps")} value={`${we.repsMin}–${we.repsMax}`} extra={we.targetRpe ? `@${we.targetRpe}` : null} />
                <Spec label={t(locale, "workout.rest")} value={`${we.restSec}s`} />
              </dl>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <ActionForm action={updateExerciseLoadAction} className="flex items-center gap-1.5" toast={t(locale, "toast.saved")}>
                  <input type="hidden" name="workoutExerciseId" value={we.id} />
                  <input name="startLoadKg" type="number" step="any" defaultValue={we.startLoadKg ?? 0} className={cn(inputClass, "tnum h-9 w-20 text-[13px]")} aria-label={t(locale, "client.workout.load")} />
                  <span className="text-[12px] text-muted">kg</span>
                  {hasSug ? (
                    <Button size="sm" variant="ghost" type="submit" title={t(locale, "form.saveLoad")} aria-label={t(locale, "form.saveLoad")}>
                      <Check className="size-4" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" type="submit">
                      {t(locale, "form.saveLoad")}
                    </Button>
                  )}
                </ActionForm>
                {hasSug ? (
                  // own form: the suggested load is the only startLoadKg sent (a second field in the load form would be ignored)
                  <ActionForm action={updateExerciseLoadAction} toast={t(locale, "toast.saved")}>
                    <input type="hidden" name="workoutExerciseId" value={we.id} />
                    <input type="hidden" name="startLoadKg" value={sug!.nextLoadKg!} />
                    <Button size="sm" variant={sug!.change === "UP" ? "primary" : "outline"} type="submit" title={sug!.explanation}>
                      <span className="tnum">
                        {sug!.change === "UP" ? "↑" : sug!.change === "DOWN" ? "↓" : "="} {sug!.nextLoadKg} kg
                      </span>
                    </Button>
                  </ActionForm>
                ) : null}
              </div>
              {sug ? <p className="mt-1 text-[12px] leading-4 text-muted">{sug.explanation}</p> : null}
              {subs.length ? (
                <details className="group mt-1.5">
                  <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                    <Repeat className="size-3.5 text-muted" aria-hidden />
                    {t(locale, "training.substitute")}
                  </summary>
                  <ActionForm action={substituteExerciseAction} className="mt-1 flex items-center gap-1.5" toast={t(locale, "toast.updated")}>
                    <input type="hidden" name="workoutExerciseId" value={we.id} />
                    <select name="exerciseId" className={cn(selectClass, "h-9 min-w-0 flex-1 text-[13px]")} aria-label={t(locale, "training.substituteWith")} defaultValue={subs[0].id}>
                      {subs.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} · {t(locale, `muscle.${x.muscleGroup}`)}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" type="submit" className="h-9">
                      {t(locale, "common.confirm")}
                    </Button>
                  </ActionForm>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
      {next ? (
        <footer className="mt-auto border-t border-border p-3">
          <LinkButton href={`/clients/${clientId}/train/${next.id}`} variant="outline" className="w-full justify-between">
            <span className="truncate">{t(locale, "client.startSession")}</span>
            <span className="tnum shrink-0 text-[12px] font-medium text-muted">{fmtDate(next.scheduledFor, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
          </LinkButton>
        </footer>
      ) : null}
    </Panel>
  );
}

function groupSets(sets: Session["sets"]) {
  const map = new Map<string, { name: string; sets: typeof sets; pr: boolean }>();
  for (const s of sets) {
    const g = map.get(s.exerciseId) ?? { name: s.exercise.name, sets: [], pr: false };
    g.sets.push(s);
    if (s.isPr) g.pr = true;
    map.set(s.exerciseId, g);
  }
  return [...map.values()].map((g) => {
    const top = g.sets.reduce((a, b) => (e1rm(b.weightKg, b.reps) > e1rm(a.weightKg, a.reps) ? b : a));
    return { name: g.name, pr: g.pr, summary: top.weightKg ? `${g.sets.length}×${top.reps} @ ${top.weightKg} kg` : `${g.sets.length}×${top.reps}` };
  });
}
