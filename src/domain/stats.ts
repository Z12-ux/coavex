/** Small, dependency-free numeric and date helpers used by the engines. */

import type { SnapshotSession, SnapshotSet } from "./types";

export const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Week starts on Sunday (Algerian working week starts Sunday). */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekKey(d: Date): string {
  return isoDate(startOfWeek(d));
}

export function mean(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function round(x: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Least-squares slope of y over x (x in days). Returns null with < 2 points. */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

/** Epley estimated one-rep max. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

// ───────────────────────────── Sessions ─────────────────────────────────────

export type EffectiveStatus = "COMPLETED" | "MISSED" | "UPCOMING" | "SKIPPED";

/** A scheduled session more than a day in the past that was never logged counts as missed. */
export function effectiveStatus(s: SnapshotSession, now: Date): EffectiveStatus {
  if (s.status === "COMPLETED") return "COMPLETED";
  if (s.status === "MISSED") return "MISSED";
  if (s.status === "SKIPPED" || s.status === "RESCHEDULED") return "SKIPPED";
  return daysBetween(s.scheduledFor, now) >= 1 ? "MISSED" : "UPCOMING";
}

export function sessionsBetween(sessions: SnapshotSession[], from: Date, to: Date): SnapshotSession[] {
  const f = startOfDay(from).getTime();
  const t = startOfDay(to).getTime();
  return sessions.filter((s) => {
    const x = startOfDay(s.scheduledFor).getTime();
    return x >= f && x < t;
  });
}

export interface CompletionStats {
  planned: number;
  completed: number;
  missed: number;
  rate: number | null;
}

export function completion(sessions: SnapshotSession[], now: Date): CompletionStats {
  let completed = 0;
  let missed = 0;
  for (const s of sessions) {
    const e = effectiveStatus(s, now);
    if (e === "COMPLETED") completed++;
    else if (e === "MISSED") missed++;
  }
  const planned = completed + missed;
  return { planned, completed, missed, rate: planned === 0 ? null : completed / planned };
}

/** Completion stats for each of the last `n` full weeks (oldest first). */
export function weeklyCompletion(sessions: SnapshotSession[], now: Date, n: number): CompletionStats[] {
  const thisWeek = startOfWeek(now);
  const out: CompletionStats[] = [];
  for (let i = n; i >= 1; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(thisWeek, -7 * (i - 1));
    out.push(completion(sessionsBetween(sessions, from, to), now));
  }
  return out;
}

// ───────────────────────────── Sets ─────────────────────────────────────────

/** Best e1RM per main lift inside a window. */
export function bestE1rmByExercise(sets: SnapshotSet[], from: Date, to: Date): Map<string, { name: string; e1rm: number; weightKg: number; reps: number }> {
  const out = new Map<string, { name: string; e1rm: number; weightKg: number; reps: number }>();
  for (const s of sets) {
    if (!s.isMainLift) continue;
    if (s.date < from || s.date >= to) continue;
    const v = e1rm(s.weightKg, s.reps);
    const cur = out.get(s.exerciseId);
    if (!cur || v > cur.e1rm) out.set(s.exerciseId, { name: s.exerciseName, e1rm: v, weightKg: s.weightKg, reps: s.reps });
  }
  return out;
}

/** Max load per week per main lift over the last n full weeks (oldest first). */
export function weeklyTopLoad(sets: SnapshotSet[], now: Date, n: number): Map<string, { name: string; loads: (number | null)[] }> {
  const thisWeek = startOfWeek(now);
  const out = new Map<string, { name: string; loads: (number | null)[] }>();
  for (const s of sets) {
    if (!s.isMainLift) continue;
    if (!out.has(s.exerciseId)) out.set(s.exerciseId, { name: s.exerciseName, loads: Array(n).fill(null) });
  }
  for (let i = n; i >= 1; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(thisWeek, -7 * (i - 1));
    for (const s of sets) {
      if (!s.isMainLift || s.date < from || s.date >= to) continue;
      const entry = out.get(s.exerciseId)!;
      const idx = n - i;
      entry.loads[idx] = Math.max(entry.loads[idx] ?? 0, s.weightKg);
    }
  }
  return out;
}

export function fmtKg(x: number): string {
  return `${round(x, 1)} kg`;
}

export function fmtPct(x: number): string {
  return `${Math.round(x)}%`;
}

export function fmtSigned(x: number, unit = "", digits = 1): string {
  const r = round(x, digits);
  return `${r > 0 ? "+" : ""}${r}${unit}`;
}
