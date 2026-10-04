/**
 * Deterministic snapshot builders for tests and scenario generation.
 * A tiny seeded PRNG keeps every scenario reproducible.
 */

import { addDays, startOfDay } from "./stats";
import type { ClientSnapshot, FrictionCategory, SnapshotDailyLog, SnapshotMeasurement, SnapshotSession, SnapshotSet } from "./types";

export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NOW = new Date("2026-09-28T10:00:00");

export function baseSnapshot(overrides: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    now: NOW,
    client: {
      id: "c1",
      firstName: "Ahmed",
      lastName: "Benali",
      status: "ACTIVE",
      onboardedAt: addDays(NOW, -90),
      checkInWeekday: 0,
      plannedSessionsPerWeek: 4,
      lastActiveAt: addDays(NOW, -1),
      preferredLocale: "fr",
    },
    goals: [{ id: "g1", type: "FAT_LOSS", title: "Perdre 8 kg", metric: "weightKg", startValue: 92, targetValue: 84, targetDate: addDays(NOW, 60), isPrimary: true, status: "ACTIVE" }],
    program: { id: "p1", name: "Force & perte de gras", status: "ACTIVE", startDate: addDays(NOW, -56), sessionsPerWeek: 4, progressionRule: "DOUBLE_PROGRESSION", deloadEveryWeeks: 5 },
    sessions: [],
    sets: [],
    measurements: [],
    dailyLogs: [],
    habits: [],
    checkIns: [],
    messages: [],
    payments: [],
    subscription: { status: "ACTIVE", endDate: addDays(NOW, 40), packageName: "Coaching 3 mois" },
    milestones: [],
    ...overrides,
  };
}

export interface SessionPlan {
  weeks: number;
  perWeek: number;
  /** completion probability per week, oldest first (length = weeks) or a single number */
  completion: number | number[];
  missedReason?: FrictionCategory | ((i: number) => FrictionCategory | null);
  seed?: number;
  shortenedRate?: number;
  rpe?: number;
}

/** Sessions on fixed weekdays (Sun/Tue/Thu/Sat for 4/week). */
export function buildSessions(plan: SessionPlan, now = NOW): SnapshotSession[] {
  const rnd = prng(plan.seed ?? 1);
  const days = [0, 2, 4, 6, 1, 3, 5].slice(0, plan.perWeek).sort();
  const out: SnapshotSession[] = [];
  const thisWeekStart = addDays(startOfDay(now), -startOfDay(now).getDay());
  let idx = 0;
  for (let w = plan.weeks; w >= 1; w--) {
    const weekStart = addDays(thisWeekStart, -7 * w);
    const p = Array.isArray(plan.completion) ? plan.completion[plan.weeks - w] ?? plan.completion.at(-1)! : plan.completion;
    for (const d of days) {
      const date = addDays(weekStart, d);
      date.setHours(18, 0, 0, 0);
      const done = rnd() < p;
      const reason = typeof plan.missedReason === "function" ? plan.missedReason(idx) : (plan.missedReason ?? null);
      out.push({
        id: `s${idx++}`,
        scheduledFor: date,
        status: done ? "COMPLETED" : "MISSED",
        completedAt: done ? date : null,
        durationMin: done ? 55 : null,
        sessionRpe: done ? (plan.rpe ?? 7.5) : null,
        isShortened: done && rnd() < (plan.shortenedRate ?? 0),
        missedReason: done ? null : reason,
        workoutName: `Séance ${String.fromCharCode(65 + (days.indexOf(d) % 3))}`,
      });
    }
  }
  // Current week: sessions up to today follow the last completion rate; later ones are scheduled.
  const pLast = Array.isArray(plan.completion) ? plan.completion.at(-1)! : plan.completion;
  for (const d of days) {
    const date = addDays(thisWeekStart, d);
    date.setHours(18, 0, 0, 0);
    if (date > now) {
      out.push({ id: `s${idx++}`, scheduledFor: date, status: "SCHEDULED", completedAt: null, durationMin: null, sessionRpe: null, isShortened: false, missedReason: null, workoutName: "Séance A" });
      continue;
    }
    const done = rnd() < pLast;
    const reason = typeof plan.missedReason === "function" ? plan.missedReason(idx) : (plan.missedReason ?? null);
    out.push({ id: `s${idx++}`, scheduledFor: date, status: done ? "COMPLETED" : "MISSED", completedAt: done ? date : null, durationMin: done ? 55 : null, sessionRpe: done ? (plan.rpe ?? 7.5) : null, isShortened: false, missedReason: done ? null : reason, workoutName: "Séance A" });
  }
  return out;
}

/** Weight series: linear trend + noise, one measurement every `every` days. */
export function buildWeights(opts: { start: number; perWeek: number; days: number; every?: number; noise?: number; seed?: number }, now = NOW): SnapshotMeasurement[] {
  const rnd = prng(opts.seed ?? 2);
  const out: SnapshotMeasurement[] = [];
  for (let d = opts.days; d >= 0; d -= opts.every ?? 3) {
    const t = opts.days - d;
    const w = opts.start + (opts.perWeek * t) / 7 + (rnd() - 0.5) * (opts.noise ?? 0.4);
    out.push({ date: addDays(startOfDay(now), -d), weightKg: Math.round(w * 10) / 10, waistCm: null, bodyFatPct: null });
  }
  return out;
}

export function buildDailyLogs(opts: { days: number; sleep: number | ((dayAgo: number) => number); energy?: number; recovery?: number; soreness?: number; stress?: number; nutrition?: number; seed?: number; skip?: number }, now = NOW): SnapshotDailyLog[] {
  const rnd = prng(opts.seed ?? 3);
  const out: SnapshotDailyLog[] = [];
  for (let d = opts.days - 1; d >= 0; d--) {
    if (opts.skip && rnd() < opts.skip) continue;
    const sleep = typeof opts.sleep === "function" ? opts.sleep(d) : opts.sleep;
    out.push({
      date: addDays(startOfDay(now), -d),
      sleepHours: Math.round((sleep + (rnd() - 0.5) * 0.6) * 10) / 10,
      sleepQuality: null,
      energy: opts.energy ?? 4,
      soreness: opts.soreness ?? 2,
      stress: opts.stress ?? 2,
      perceivedRecovery: opts.recovery ?? 4,
      nutritionAdherence: opts.nutrition ?? 4,
    });
  }
  return out;
}

/** Main-lift sets: top load per week following `loads` (oldest first), 3 sets each on session days. */
export function buildSets(opts: { exerciseId: string; name: string; loads: number[]; reps?: number; weekday?: number }, now = NOW): SnapshotSet[] {
  const out: SnapshotSet[] = [];
  const thisWeekStart = addDays(startOfDay(now), -startOfDay(now).getDay());
  const n = opts.loads.length;
  opts.loads.forEach((load, i) => {
    const weekStart = addDays(thisWeekStart, -7 * (n - i));
    const date = addDays(weekStart, opts.weekday ?? 2);
    for (let s = 0; s < 3; s++) out.push({ date, exerciseId: opts.exerciseId, exerciseName: opts.name, isMainLift: true, reps: opts.reps ?? 8, weightKg: load, rpe: 8 });
  });
  return out;
}
