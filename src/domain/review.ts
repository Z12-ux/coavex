/**
 * WEEKLY REVIEW
 *
 * One structured card per client so the coach can review everyone in minutes:
 * STATUS → WHAT CHANGED → WENT WELL → WENT WRONG → NEEDS ATTENTION → ACTION.
 */

import { tx } from "./catalog";
import { deriveActions } from "./actions";
import { addDays, bestE1rmByExercise, completion, daysBetween, pctChange, round, sessionsBetween, startOfWeek } from "./stats";
import { detectSignals } from "./signals";
import type { ClientSnapshot, Locale, WeeklyReviewSummary } from "./types";

export function buildWeeklyReview(snap: ClientSnapshot, locale: Locale = "fr"): WeeklyReviewSummary {
  const now = snap.now;
  const thisWeek = startOfWeek(now);
  const lastWeekStart = addDays(thisWeek, -7);
  const prevWeekStart = addDays(thisWeek, -14);

  const lastWeek = completion(sessionsBetween(snap.sessions, lastWeekStart, thisWeek), now);
  const prevWeek = completion(sessionsBetween(snap.sessions, prevWeekStart, lastWeekStart), now);

  const ciLast = snap.checkIns.find((c) => c.weekStart >= lastWeekStart && c.weekStart < thisWeek) ?? snap.checkIns.filter((c) => c.submittedAt && c.submittedAt >= lastWeekStart).at(-1);
  const checkInDone = !!ciLast?.submittedAt;

  const ws = snap.measurements.filter((m) => m.weightKg !== null);
  const wLast = ws.filter((m) => m.date >= lastWeekStart && m.date < thisWeek).at(-1) ?? ws.filter((m) => m.date < thisWeek).at(-1);
  const wPrev = ws.filter((m) => m.date >= prevWeekStart && m.date < lastWeekStart).at(-1);
  const weightDeltaKg = wLast?.weightKg != null && wPrev?.weightKg != null ? round(wLast.weightKg - wPrev.weightKg, 1) : null;

  const whatChanged: string[] = [];
  if (weightDeltaKg !== null) whatChanged.push(tx(locale, "rev.changed.weight", { delta: `${weightDeltaKg > 0 ? "+" : ""}${weightDeltaKg}` }));
  if (lastWeek.planned || prevWeek.planned) whatChanged.push(tx(locale, "rev.changed.sessions", { cur: `${lastWeek.completed}/${lastWeek.planned}`, prev: `${prevWeek.completed}/${prevWeek.planned}` }));
  const recent = bestE1rmByExercise(snap.sets, lastWeekStart, thisWeek);
  const before = bestE1rmByExercise(snap.sets, addDays(lastWeekStart, -21), lastWeekStart);
  for (const [id, r] of recent) {
    const b = before.get(id);
    if (!b) continue;
    const pct = pctChange(b.e1rm, r.e1rm);
    if (pct !== null && Math.abs(pct) >= 2) whatChanged.push(tx(locale, "rev.changed.perf", { exercise: r.name, delta: `${pct > 0 ? "+" : ""}${round(pct, 1)}` }));
  }

  const wentWell: string[] = [];
  const wentWrong: string[] = [];
  if (lastWeek.planned && (lastWeek.rate ?? 0) >= 0.75) wentWell.push(tx(locale, "rev.well.sessions", { done: lastWeek.completed, planned: lastWeek.planned }));
  if (lastWeek.missed > 0) wentWrong.push(tx(locale, "rev.wrong.sessions", { missed: lastWeek.missed }));
  if (checkInDone) wentWell.push(tx(locale, "rev.well.checkin"));
  else if (["ACTIVE", "TRIAL"].includes(snap.client.status) && daysBetween(snap.client.onboardedAt, now) >= 7) wentWrong.push(tx(locale, "rev.wrong.checkin"));

  const signals = detectSignals(snap, locale);
  for (const s of signals) {
    if (s.polarity === "POSITIVE") wentWell.push(s.what);
  }
  const needsAttention = signals.filter((s) => s.polarity === "NEGATIVE" && s.severity !== "INFO").map((s) => `${s.title}: ${s.what}`);
  const actions = deriveActions(signals, snap, locale);
  const possibleAction = actions[0]?.kind === "NO_ACTION" ? null : (actions[0]?.title ?? null);

  const maxSev = signals.filter((s) => s.polarity === "NEGATIVE").reduce((m, s) => Math.max(m, s.severity === "URGENT" ? 3 : s.severity === "ATTENTION" ? 2 : s.severity === "WATCH" ? 1 : 0), 0);
  let status: WeeklyReviewSummary["status"] = maxSev >= 2 ? "NEEDS_ATTENTION" : maxSev === 1 ? "WATCH" : "ON_TRACK";
  if (daysBetween(snap.client.onboardedAt, now) < 14) status = "NEW";

  return {
    status,
    whatChanged,
    wentWell,
    wentWrong,
    needsAttention,
    possibleAction,
    metrics: { sessionsDone: lastWeek.completed, sessionsPlanned: lastWeek.planned, checkInDone, weightDeltaKg },
  };
}
