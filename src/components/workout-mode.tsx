"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, Clock, Copy, Dumbbell, Flag, History, Layers, Repeat, Star, Timer, TrendingUp, TriangleAlert } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { Button, CtaArrow, cn, textareaClass } from "./ui";
import { RingGauge } from "./charts";
import { HeroCard } from "./stat-card";
import { MuscleMap, muscleGroupsOf } from "./muscle-map";
import { Stepper } from "./stepper";
import { RestTimer } from "./rest-timer";
import { toast } from "./toast";

export interface WorkoutModeExercise {
  weId: string;
  name: string;
  isMainLift: boolean;
  muscleGroup: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetRpe: number | null;
  restSec: number;
  prefillKg: number;
  suggestion: string | null;
  last: { reps: number; weightKg: number }[];
}

export interface WorkoutModeProps {
  locale: Locale;
  sessionId: string;
  workoutName: string;
  focus: string;
  minutes: number;
  isShortened: boolean;
  personName?: string; // shown in coach mode
  backHref: string;
  warnings: string[];
  exercises: WorkoutModeExercise[];
  submit: (formData: FormData) => Promise<void | unknown>;
}

type SetState = { reps: number | ""; kg: number | ""; done: boolean };

/** Uppercase tracked label. Not `.t-kicker`: that class pins its colour (unlayered CSS beats utilities). */
const KICKER = "text-[11.5px] font-semibold uppercase leading-[14px] tracking-[0.16em]";
/** Set row columns: copy/# · reps · kg · check. Reps gets less room than kg on phones so "81.25" fits at 360 px. */
const SET_ROW = "grid grid-cols-[36px_minmax(0,9fr)_minmax(0,11fr)_44px] items-center gap-1 sm:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_52px] sm:gap-2";

const repRange = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/**
 * Focused workout mode for gym conditions (Forge skin — reference screens
 * "BACK & BICEPS" and "PULL UPS"): sticky header with the workout name and a
 * glowing progress ring, an overview (meta + muscle map), one exercise expanded
 * at a time with SETS / REPS / REST tiles, big steppers, "copy previous",
 * one-tap set completion that starts the rest timer, and a sticky footer.
 * Same component for the coach (logging for a client) and for the client app.
 *
 * One neon per screen: while sets remain, the neon CTA is "Log set N" inside the
 * open exercise and "Finish" is an outline button; once every set is done,
 * "Finish" becomes the neon CTA.
 *
 * e2e contract: exercise headers are `main ol > li > button[aria-expanded]`, the
 * set-check buttons are the ONLY `aria-pressed` controls on the page, the rest
 * timer keeps role="timer", the finish button text contains client.workout.finish.
 */
export function WorkoutMode(p: WorkoutModeProps) {
  const { locale } = p;
  const L = (key: string) => t(locale, key);
  const [state, setState] = useState<Record<string, SetState[]>>(() => Object.fromEntries(p.exercises.map((e) => [e.weId, Array.from({ length: e.sets }, (_, i) => ({ reps: e.last[i]?.reps ?? e.repsMax, kg: e.prefillKg || (e.last[i]?.weightKg ?? ""), done: false }))])));
  const [open, setOpen] = useState<string>(p.exercises[0]?.weId ?? "");
  const [timerSignal, setTimerSignal] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [rpe, setRpe] = useState<number | "">("");
  const [shortened, setShortened] = useState(p.isShortened);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  // Large title → compact title once the header sticks (sentinel leaves the area under the 56 px shell bar).
  const [compact, setCompact] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { rootMargin: "-57px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const doneSets = useMemo(() => Object.values(state).flat().filter((s) => s.done).length, [state]);
  const totalSets = useMemo(() => Object.values(state).flat().length, [state]);
  const doneExercises = useMemo(() => p.exercises.filter((e) => state[e.weId]?.every((s) => s.done)).length, [state, p.exercises]);
  const allDone = totalSets > 0 && doneSets === totalSets;
  const frac = totalSets ? doneSets / totalSets : 0;
  const pct = Math.round(frac * 100);
  const minutes = shortened ? 30 : p.minutes;

  const groups = useMemo(() => muscleGroupsOf(p.exercises), [p.exercises]);
  const setsByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of p.exercises) m.set(e.muscleGroup, (m.get(e.muscleGroup) ?? 0) + e.sets);
    return m;
  }, [p.exercises]);
  const focusKey = `workout.focus.${p.focus}`;
  const focusLabel = p.focus ? (t(locale, focusKey) === focusKey ? p.focus.replace(/_/g, " ") : t(locale, focusKey)) : null;

  // Next undone set, starting from the open exercise (shown under the rest timer).
  const upNext = useMemo(() => {
    const n = p.exercises.length;
    const from = Math.max(0, p.exercises.findIndex((e) => e.weId === open));
    for (let k = 0; k < n; k++) {
      const ex = p.exercises[(from + k) % n];
      const i = state[ex.weId].findIndex((s) => !s.done);
      if (i >= 0) return { ex, i };
    }
    return null;
  }, [state, open, p.exercises]);

  const update = (weId: string, i: number, patch: Partial<SetState>) => setState((st) => ({ ...st, [weId]: st[weId].map((s, k) => (k === i ? { ...s, ...patch } : s)) }));

  const markDone = (ex: WorkoutModeExercise, i: number) => {
    const cur = state[ex.weId][i];
    const done = !cur.done;
    update(ex.weId, i, { done });
    if (done) {
      setTimerSeconds(ex.restSec || 90);
      setTimerSignal((s) => s + 1);
      // auto-advance to next exercise when all its sets are done
      const allExDone = state[ex.weId].every((s, k) => (k === i ? true : s.done));
      if (allExDone) {
        const idx = p.exercises.findIndex((e) => e.weId === ex.weId);
        const next = p.exercises[idx + 1];
        if (next) setOpen(next.weId);
      }
    }
  };

  const copyPrev = (ex: WorkoutModeExercise, i: number) => {
    const prev = i > 0 ? state[ex.weId][i - 1] : ex.last[i] ? { reps: ex.last[i].reps, kg: ex.last[i].weightKg } : null;
    if (prev) update(ex.weId, i, { reps: prev.reps, kg: prev.kg });
  };

  const finish = () => {
    if (doneSets === 0 && !window.confirm(L("workout.confirmEmpty"))) return;
    const fd = new FormData();
    fd.set("sessionId", p.sessionId);
    if (rpe !== "") fd.set("sessionRpe", String(rpe));
    if (shortened) fd.set("isShortened", "1");
    fd.set("clientNote", note);
    for (const ex of p.exercises) {
      state[ex.weId].forEach((s, i) => {
        if (!s.done) return;
        fd.set(`set:${ex.weId}:${i}:reps`, String(s.reps === "" ? 0 : s.reps));
        fd.set(`set:${ex.weId}:${i}:kg`, String(s.kg === "" ? 0 : s.kg));
      });
    }
    start(async () => {
      try {
        await p.submit(fd);
      } catch (err) {
        const digest = (err as { digest?: string } | null)?.digest ?? "";
        if (!digest.startsWith("NEXT_REDIRECT")) toast(t(locale, "error.generic"), "bad", 4000);
        throw err;
      }
    });
  };

  const setLine = (s: SetState) => `${s.reps === "" ? "–" : s.reps} ${L("client.workout.reps").toLowerCase()}${s.kg ? ` · ${s.kg} kg` : ""}`;
  const kicker = `${L("client.actions.session")}${p.personName ? ` · ${p.personName}` : ""}`;

  return (
    <div className="mx-auto max-w-xl">
      <div ref={sentinel} aria-hidden className="h-px" />

      {/* Sticky context: back · kicker · title · progress ring · progress bar */}
      <header className="sticky top-14 z-20 -mx-4 border-b border-border bg-bg/85 px-4 pb-2.5 pt-1.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link href={p.backHref} className="press -ms-2.5 grid size-11 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={L("common.back")} title={L("common.back")}>
            <ChevronLeft className="size-6 rtl:rotate-180" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className={cn(KICKER, "truncate text-accent")}>{kicker}</p>
            <h1 className={cn("text-ink", compact ? "mt-0.5 truncate font-display text-[22px] font-extrabold uppercase leading-6" : "t-display mt-1 line-clamp-2 break-words")}>{p.workoutName}</h1>
          </div>
          <RingGauge value={frac} size={compact ? 44 : 58} stroke={compact ? 4 : 5} tone={allDone ? "good" : "accent"} label={L("workout.progress")}>
            <span className={cn("font-display font-bold leading-none tnum text-ink", compact ? "text-[12px]" : "text-[15px]")}>{pct}%</span>
          </RingGauge>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-3">
          <div className={cn("h-full rounded-full", allDone ? "bg-good" : "bg-accent", doneSets > 0 && "glow-sm")} style={{ width: `${pct}%`, transition: "width var(--t-med) var(--ease-out)" }} />
        </div>
        <div className={cn(KICKER, "mt-1.5 flex items-center justify-between gap-3 text-[12px] tracking-[0.12em] text-muted tnum")}>
          <span className="truncate">
            {doneExercises}/{p.exercises.length} {L("workout.exercises")} · {doneSets}/{totalSets} {L("workout.sets")}
          </span>
          <span className="shrink-0">
            <span dir="ltr">~{minutes}</span> {L("workout.min")}
          </span>
        </div>
      </header>

      {p.warnings.length ? (
        <div role="note" className="mt-4 flex gap-3 rounded-lg border border-warn/35 bg-warn-soft px-3.5 py-3">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <ul className="space-y-1 text-[13px] leading-5 text-ink">
            {p.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Overview: badges + meta rows, muscle map (front + back) and legend */}
      <HeroCard className="mt-4" aria-label={L("workout.overview")}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {focusLabel || shortened ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {focusLabel ? <span className={cn(KICKER, "rounded-full border border-accent/50 px-2.5 py-1 tracking-[0.14em] text-accent")}>{focusLabel}</span> : null}
                {shortened ? <span className={cn(KICKER, "rounded-full bg-warn-soft px-2.5 py-1 tracking-[0.1em] text-warn")}>{L("client.workout.shortened")}</span> : null}
              </div>
            ) : null}
            <ul className="space-y-3">
              <MetaRow icon={<Clock className="size-4" />} value={`~${minutes}`} unit={L("workout.min")} />
              <MetaRow icon={<Dumbbell className="size-4" />} value={p.exercises.length} unit={L("workout.exercises")} />
              <MetaRow icon={<Layers className="size-4" />} value={totalSets} unit={L("workout.sets")} />
            </ul>
          </div>
          <MuscleMap groups={groups} view="both" height={172} className="-me-1" label={`${L("workout.musclesTargeted")}: ${groups.map((g) => L(`muscle.${g}`)).join(", ")}`} />
        </div>
        {groups.length ? (
          <div className="mt-4 border-t border-border pt-3">
            <h2 className={cn(KICKER, "text-ink-2")}>{L("workout.musclesTargeted")}</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
              {groups.map((g) => (
                <li key={g} className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
                  {L(`muscle.${g}`)}
                  <span className="tnum text-[12px] text-muted">
                    {setsByGroup.get(g) ?? 0} {L("workout.sets").toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </HeroCard>

      <div className="mb-2.5 mt-6 flex items-end justify-between gap-3">
        <h2 className={cn(KICKER, "text-ink-2")}>{L("program.exercises")}</h2>
        <span className="t-meta tnum">
          {doneExercises}/{p.exercises.length}
        </span>
      </div>

      <ol className="enter-stagger space-y-2.5">
        {p.exercises.map((ex, idx) => {
          const sets = state[ex.weId];
          const done = sets.filter((s) => s.done).length;
          const isOpen = open === ex.weId;
          const complete = done === sets.length;
          const nextIdx = sets.findIndex((s) => !s.done);
          return (
            <li key={ex.weId} className={cn("rounded-lg border bg-surface transition-colors", isOpen ? "border-accent/50" : "border-border")}>
              <button type="button" onClick={() => setOpen(isOpen ? "" : ex.weId)} className="flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3 text-start" aria-expanded={isOpen}>
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full font-display text-[16px] font-bold tnum", complete ? "bg-accent text-accent-ink" : isOpen ? "border-2 border-accent text-accent" : "border border-border-strong bg-surface-2 text-ink-2")}>{complete ? <Check className="size-4" strokeWidth={3} /> : idx + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("line-clamp-2 break-words font-display text-[19px] font-bold uppercase leading-6 tracking-[0.01em]", complete && !isOpen ? "text-ink-2" : "text-ink")}>{ex.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn(KICKER, "rounded-sm border border-border-strong bg-surface-2 px-1.5 py-px text-[11px] tracking-[0.1em] text-ink-2")}>{L(`muscle.${ex.muscleGroup}`)}</span>
                    {ex.isMainLift ? (
                      <span className={cn(KICKER, "inline-flex items-center gap-1 rounded-sm border border-accent/40 px-1.5 py-px text-[11px] tracking-[0.1em] text-accent")}>
                        <Star aria-hidden className="size-2.5 fill-current" />
                        {L("workout.mainLift")}
                      </span>
                    ) : null}
                    <span className="t-caption tnum" dir="ltr">
                      {ex.sets} × {repRange(ex.repsMin, ex.repsMax)}
                      {ex.targetRpe ? ` @RPE ${ex.targetRpe}` : ""} · {ex.restSec}s
                    </span>
                  </span>
                </span>
                <span className={cn("shrink-0 font-display text-[16px] font-bold tnum", complete ? "text-accent" : "text-ink-2")}>
                  {done}/{sets.length}
                </span>
                <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} style={{ transitionDuration: "var(--t-fast)" }} />
              </button>
              {isOpen ? (
                <div className="enter space-y-3 border-t border-border px-2.5 pb-3.5 pt-3 sm:px-4">
                  {/* SETS | REPS | REST tiles */}
                  <div className="grid grid-cols-3 gap-2">
                    <Tile icon={<Layers className="size-3.5" />} label={L("workout.sets")} value={ex.sets} />
                    <Tile icon={<Repeat className="size-3.5" />} label={L("client.workout.reps")} value={repRange(ex.repsMin, ex.repsMax)} hint={ex.targetRpe ? `@RPE ${ex.targetRpe}` : undefined} />
                    <Tile icon={<Timer className="size-3.5" />} label={L("workout.rest")} value={ex.restSec ? `${ex.restSec}s` : "–"} />
                  </div>

                  {ex.suggestion ? (
                    <div className="flex gap-2.5 rounded-md border border-accent/25 bg-accent-soft px-3 py-2.5">
                      <TrendingUp aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                      <div className="min-w-0">
                        <p className={cn(KICKER, "text-accent")}>{L("program.suggestion")}</p>
                        <p className="mt-1 text-[13px] leading-5 text-ink">{ex.suggestion}</p>
                      </div>
                    </div>
                  ) : null}

                  {ex.last.length ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[12.5px]">
                      <span className={cn(KICKER, "inline-flex items-center gap-1 text-muted")}>
                        <History aria-hidden className="size-3.5" />
                        {L("client.workout.last")}
                      </span>
                      <span className="tnum font-medium text-ink-2" dir="ltr">{ex.last.map((s) => `${s.reps}×${s.weightKg || "–"}`).join(" · ")}</span>
                    </p>
                  ) : null}

                  <div>
                    <div className={cn(SET_ROW, KICKER, "mb-1.5 text-center text-[11px] tracking-[0.12em] text-muted")}>
                      <span>#</span>
                      <span className="truncate">{L("client.workout.reps")}</span>
                      <span className="truncate">{L("client.workout.load")} (kg)</span>
                      <span />
                    </div>
                    <div className="space-y-2">
                      {sets.map((s, i) => {
                        const canCopy = i > 0 || !!ex.last[i];
                        const isNext = i === nextIdx;
                        const copyLabel = `${L("workout.copyPrev")} (${L("client.workout.set")} ${i + 1})`;
                        return (
                          <div key={i} className={SET_ROW} role="group" aria-label={`${L("client.workout.set")} ${i + 1}`}>
                            <button type="button" onClick={() => copyPrev(ex, i)} disabled={!canCopy} className="press flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md text-muted hover:bg-surface-2 hover:text-ink disabled:hover:bg-transparent" aria-label={copyLabel} title={canCopy ? copyLabel : undefined}>
                              <span className={cn("font-display text-[15px] font-bold leading-none tnum", s.done ? "text-muted-2" : isNext ? "text-accent" : "text-ink-2")}>{i + 1}</span>
                              {canCopy ? <Copy aria-hidden className="size-3.5" /> : null}
                            </button>
                            <Stepper label={L("client.workout.reps")} value={s.reps} onChange={(v) => update(ex.weId, i, { reps: v })} step={1} min={0} max={100} inputMode="numeric" className={cn(s.done && "opacity-50")} />
                            <Stepper label={L("client.workout.load")} value={s.kg} onChange={(v) => update(ex.weId, i, { kg: v })} step={ex.isMainLift ? 2.5 : 1.25} min={0} max={500} className={cn(s.done && "opacity-50")} />
                            <button
                              type="button"
                              onClick={() => markDone(ex, i)}
                              className={cn("press grid h-12 w-full place-items-center rounded-md border-2", s.done ? "pop border-accent bg-accent text-accent-ink glow-sm" : isNext ? "border-accent/60 bg-surface-2 text-accent hover:bg-accent-soft" : "border-border-strong bg-surface-2 text-muted-2 hover:border-accent/50 hover:text-ink")}
                              aria-pressed={s.done}
                              aria-label={`${L("client.workout.set")} ${i + 1} · ${L("common.done")}`}
                            >
                              <Check className="size-5" strokeWidth={s.done ? 3 : 2.25} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* "LOG SET ✓": marks the next undone set and starts the rest timer. No aria-pressed (e2e). */}
                  {nextIdx >= 0 ? (
                    <Button type="button" variant="neon" className="h-14 w-full justify-between gap-3 ps-5 pe-2.5 text-[14.5px]" onClick={() => markDone(ex, nextIdx)}>
                      <span className="flex min-w-0 flex-col items-start leading-tight">
                        <span className="max-w-full truncate">
                          {L("workout.logSet")} {nextIdx + 1}
                        </span>
                        <span className="max-w-full truncate font-display text-[13px] font-semibold tracking-normal tnum opacity-75">{setLine(sets[nextIdx])}</span>
                      </span>
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-accent-ink/55">
                        <Check className="size-4" strokeWidth={3} />
                      </span>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Session wrap-up: RPE, shortened, note */}
      <section className="mt-5 rounded-lg border border-border bg-surface p-4">
        <h2 className={cn(KICKER, "text-ink-2")}>{L("workout.wrapUp")}</h2>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="t-label">{L("client.workout.rpe")}</div>
            <div className="t-caption mt-0.5">{L("workout.rpeHint")}</div>
          </div>
          <Stepper label={L("client.workout.rpe")} value={rpe} onChange={(v) => setRpe(v === "" ? "" : Math.min(10, Math.max(1, v)))} step={0.5} min={1} max={10} className="w-36 sm:w-44" />
        </div>
        <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-2 px-3 text-[14px] text-ink">
          <input type="checkbox" checked={shortened} onChange={(e) => setShortened(e.target.checked)} className="size-5 shrink-0 accent-[var(--accent)]" />
          <span className="flex-1">{L("client.workout.shortened")}</span>
          <span className="t-meta tnum">
            <span dir="ltr">~{minutes}</span> {L("workout.min")}
          </span>
        </label>
        <label className="mt-3 block">
          <span className="t-label mb-1.5 block">{p.personName ? L("workout.sessionNote") : L("client.workout.note")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} rows={2} maxLength={500} />
        </label>
      </section>

      {/* Sticky footer: rest timer + finish (neon once every set is done) */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-bg/90 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md">
        <RestTimer
          startSignal={timerSignal}
          seconds={timerSeconds}
          caption={
            upNext ? (
              <>
                <span className="text-muted">{L("common.next")} · </span>
                {upNext.ex.name} · {L("client.workout.set")} {upNext.i + 1}
              </>
            ) : undefined
          }
          labels={{ rest: L("workout.rest"), skip: L("workout.skip"), extend: "+30s", done: L("workout.restDone"), pause: L("workout.pause"), resume: L("workout.resume"), close: L("common.close") }}
        />
        <Button type="button" variant={allDone ? "neon" : "outline"} className="h-14 w-full justify-between gap-3 ps-5 pe-2.5 text-[14.5px] font-bold uppercase tracking-[0.08em]" onClick={finish} disabled={pending}>
          <span className="flex min-w-0 items-baseline gap-2.5">
            <span className="truncate">{pending ? L("common.loading") : L("client.workout.finish")}</span>{" "}
            <span className="shrink-0 font-display text-[17px] tracking-normal tnum">
              {doneSets}/{totalSets}
            </span>
          </span>
          {allDone ? (
            <CtaArrow />
          ) : (
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-ink-2">
              <Flag className="size-4" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function MetaRow({ icon, value, unit }: { icon: ReactNode; value: ReactNode; unit: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-accent">
        {icon}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="font-display text-[20px] font-bold leading-none tnum text-ink" dir="ltr">
          {value}
        </span>
        <span className={cn(KICKER, "truncate text-[12px] tracking-[0.12em] text-muted")}>{unit}</span>
      </span>
    </li>
  );
}

/** Bordered stat tile: "SETS 4 · REPS 8-12 · REST 60s". */
function Tile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-border-strong bg-surface-2 px-2 pb-2.5 pt-2 text-center">
      <span className={cn(KICKER, "flex max-w-full items-center gap-1 text-[11px] tracking-[0.14em] text-muted")}>
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="t-metric mt-1.5 text-ink" dir="ltr">
        {value}
      </span>
      {hint ? (
        <span className="t-meta mt-1 tnum" dir="ltr">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
