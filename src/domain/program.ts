/**
 * ADAPTIVE PROGRAM RULES
 *
 * Progression suggestions, missed-session options and deload hints.
 * Everything here is a suggestion the coach (or client, for low-impact
 * choices) confirms; nothing is applied automatically.
 */

import { tx } from "./catalog";
import { addDays, daysBetween, isSameDay, mean, round } from "./stats";
import type { Locale, MissedSessionOption, SnapshotDailyLog, SnapshotSession } from "./types";

export interface ProgressionInput {
  rule: "DOUBLE_PROGRESSION" | "LINEAR" | "RPE_BASED" | "MANUAL" | string;
  repsMin: number;
  repsMax: number;
  targetRpe?: number | null;
  incrementKg?: number;
  currentLoadKg: number | null;
  lastSets: { reps: number; weightKg: number; rpe: number | null }[];
}

export interface ProgressionSuggestion {
  nextLoadKg: number | null;
  change: "UP" | "KEEP" | "DOWN" | "MANUAL";
  explanation: string;
}

export function suggestProgression(input: ProgressionInput, locale: Locale = "fr"): ProgressionSuggestion {
  const inc = input.incrementKg ?? 2.5;
  if (input.rule === "MANUAL") return { nextLoadKg: input.currentLoadKg, change: "MANUAL", explanation: tx(locale, "prog.progress.manual") };
  if (!input.lastSets.length) return { nextLoadKg: input.currentLoadKg, change: "KEEP", explanation: tx(locale, "prog.progress.nodata") };

  const load = Math.max(...input.lastSets.map((s) => s.weightKg));
  const topSets = input.lastSets.filter((s) => s.weightKg === load);
  const minReps = Math.min(...topSets.map((s) => s.reps));
  const rpes = topSets.map((s) => s.rpe).filter((x): x is number => x !== null);
  const avgRpe = rpes.length ? mean(rpes)! : null;

  if (input.rule === "RPE_BASED" && input.targetRpe) {
    if (avgRpe === null) return { nextLoadKg: load, change: "KEEP", explanation: tx(locale, "prog.progress.keep", { load, reps: minReps }) };
    if (avgRpe <= input.targetRpe - 1) return { nextLoadKg: round(load + inc, 1), change: "UP", explanation: tx(locale, "prog.progress.rpeUp", { rpe: round(avgRpe, 1), load: round(load + inc, 1) }) };
    if (avgRpe >= input.targetRpe + 1) return { nextLoadKg: round(Math.max(0, load - inc), 1), change: "DOWN", explanation: tx(locale, "prog.progress.rpeDown", { rpe: round(avgRpe, 1), load: round(Math.max(0, load - inc), 1) }) };
    return { nextLoadKg: load, change: "KEEP", explanation: tx(locale, "prog.progress.rpeKeep", { rpe: round(avgRpe, 1), load }) };
  }

  // LINEAR and DOUBLE_PROGRESSION share the rep-range logic; LINEAR progresses
  // as soon as the minimum of the range is hit on every set.
  const threshold = input.rule === "LINEAR" ? input.repsMin : input.repsMax;
  const allReached = topSets.every((s) => s.reps >= threshold) && (avgRpe === null || avgRpe <= 9);
  if (allReached) return { nextLoadKg: round(load + inc, 1), change: "UP", explanation: tx(locale, "prog.progress.up", { load: round(load + inc, 1), reps: threshold }) };
  if (minReps < input.repsMin) return { nextLoadKg: round(Math.max(0, load * 0.95), 1), change: "DOWN", explanation: tx(locale, "prog.progress.down", { load: round(Math.max(0, load * 0.95), 1) }) };
  return { nextLoadKg: load, change: "KEEP", explanation: tx(locale, "prog.progress.keep", { load, reps: minReps }) };
}

export interface MissedInput {
  missed: SnapshotSession;
  /** other sessions of the same week (scheduled or done) */
  weekSessions: SnapshotSession[];
  now: Date;
  missedThisWeek: number;
}

const DAY_NAMES: Record<Locale, string[]> = {
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};

export function missedSessionOptions(input: MissedInput, locale: Locale = "fr"): MissedSessionOption[] {
  const out: MissedSessionOption[] = [];
  const manyMissed = input.missedThisWeek >= 2;

  // Find a free day in the next 3 days without another session.
  let freeDay: Date | null = null;
  for (let i = 0; i <= 3 && !freeDay; i++) {
    const d = addDays(input.now, i);
    const busy = input.weekSessions.some((s) => s.id !== input.missed.id && isSameDay(s.scheduledFor, d));
    if (!busy && daysBetween(input.missed.scheduledFor, d) >= 0) freeDay = d;
  }
  if (freeDay && !manyMissed) {
    out.push({ kind: "MOVE", title: tx(locale, "prog.opt.MOVE.title", { day: DAY_NAMES[locale][freeDay.getDay()] }), detail: tx(locale, "prog.opt.MOVE.detail"), recommended: true });
  }
  out.push({ kind: "COMPRESS", title: tx(locale, "prog.opt.COMPRESS.title"), detail: tx(locale, "prog.opt.COMPRESS.detail"), recommended: !freeDay && !manyMissed });
  if (manyMissed) out.push({ kind: "COACH_REVIEW", title: tx(locale, "prog.opt.COACH_REVIEW.title"), detail: tx(locale, "prog.opt.COACH_REVIEW.detail"), recommended: true });
  out.push({ kind: "SKIP", title: tx(locale, "prog.opt.SKIP.title"), detail: tx(locale, "prog.opt.SKIP.detail"), recommended: false });
  return out;
}

export interface DeloadInput {
  programStart: Date;
  now: Date;
  deloadEveryWeeks: number | null;
  dailyLogs: SnapshotDailyLog[];
  recentSessions: SnapshotSession[];
}

export function deloadSuggestion(input: DeloadInput, locale: Locale = "fr"): { recommended: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const week = Math.floor(daysBetween(input.programStart, input.now) / 7) + 1;
  if (input.deloadEveryWeeks && week > 1 && week % input.deloadEveryWeeks === 0) reasons.push(tx(locale, "prog.deload.cycle", { week, every: input.deloadEveryWeeks }));
  const logs = input.dailyLogs.filter((l) => daysBetween(l.date, input.now) < 7);
  if (logs.length >= 4) {
    const rec = mean(logs.map((l) => l.perceivedRecovery).filter((x): x is number => x !== null));
    const en = mean(logs.map((l) => l.energy).filter((x): x is number => x !== null));
    if ((rec !== null && rec <= 2.5) || (en !== null && en <= 2.5)) reasons.push(tx(locale, "prog.deload.recovery"));
  }
  const rpes = input.recentSessions.filter((s) => s.status === "COMPLETED" && s.sessionRpe !== null && daysBetween(s.scheduledFor, input.now) < 14).map((s) => s.sessionRpe!);
  if (rpes.length >= 3) {
    const avg = mean(rpes)!;
    if (avg >= 8.5) reasons.push(tx(locale, "prog.deload.rpe", { rpe: round(avg, 1) }));
  }
  return { recommended: reasons.length > 0, reasons };
}
