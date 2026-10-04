/**
 * CHECK-IN SUMMARY
 *
 * Turns a submitted weekly check-in (plus the previous one and the client's
 * goal) into the structured summary the coach approves, edits or ignores.
 */

import { tx } from "./catalog";
import { round } from "./stats";
import type { CheckInSummary, Locale, SnapshotCheckIn, SnapshotGoal, Trend } from "./types";

function cmp(cur: number | null, prev: number | null, threshold: number): Trend {
  if (cur === null || prev === null) return "FLAT";
  if (cur - prev > threshold) return "UP";
  if (prev - cur > threshold) return "DOWN";
  return "FLAT";
}

export function summarizeCheckIn(current: SnapshotCheckIn, previous: SnapshotCheckIn | null, goal: SnapshotGoal | null, locale: Locale = "fr"): CheckInSummary {
  // Progress: weight movement interpreted through the goal direction.
  let progress: Trend = "FLAT";
  let weightDelta: number | null = null;
  if (current.weightKg !== null && previous?.weightKg != null) {
    weightDelta = current.weightKg - previous.weightKg;
    const wantsDown = goal?.type === "FAT_LOSS";
    const wantsUp = goal?.type === "MUSCLE_GAIN";
    if (Math.abs(weightDelta) >= 0.3) {
      if (wantsDown) progress = weightDelta < 0 ? "UP" : "DOWN";
      else if (wantsUp) progress = weightDelta > 0 ? "UP" : "DOWN";
    }
  }

  const trainRate = (c: SnapshotCheckIn) => (c.trainingPlanned ? (c.trainingCompleted ?? 0) / c.trainingPlanned : null);
  const training = cmp(trainRate(current), previous ? trainRate(previous) : null, 0.15);
  const nutrition = cmp(current.nutritionAdherence, previous?.nutritionAdherence ?? null, 0.5);

  const recScore = (c: SnapshotCheckIn) => {
    const vals: number[] = [];
    if (c.energy !== null) vals.push(c.energy);
    if (c.stress !== null) vals.push(6 - c.stress);
    if (c.soreness !== null) vals.push(6 - c.soreness);
    if (c.sleepAvgHours !== null) vals.push(Math.min(5, Math.max(1, c.sleepAvgHours - 3)));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const recovery = cmp(recScore(current), previous ? recScore(previous) : null, 0.4);

  // Main issue: the weakest area in absolute terms.
  const issues: { key: string; severity: number }[] = [];
  if (current.sleepAvgHours !== null && current.sleepAvgHours < 6.5) issues.push({ key: "sleep", severity: 6.5 - current.sleepAvgHours + 1 });
  if (current.nutritionAdherence !== null && current.nutritionAdherence <= 2) issues.push({ key: "nutrition", severity: 3 - current.nutritionAdherence + 0.5 });
  const tr = trainRate(current);
  if (tr !== null && tr < 0.6) issues.push({ key: "training", severity: (0.6 - tr) * 3 + 0.5 });
  if (current.energy !== null && current.energy <= 2) issues.push({ key: "recovery", severity: 3 - current.energy + 0.2 });
  if (current.stress !== null && current.stress >= 4) issues.push({ key: "stress", severity: current.stress - 3 });
  for (const tag of current.frictionTags) {
    if (tag === "RECOVERY") issues.push({ key: "recovery", severity: 1 });
    if (tag === "NUTRITION") issues.push({ key: "nutrition", severity: 1 });
    if (tag === "TIME" || tag === "SCHEDULE") issues.push({ key: "training", severity: 0.8 });
  }
  issues.sort((a, b) => b.severity - a.severity);
  const mainKey = issues[0]?.key ?? null;

  const highlights: string[] = [];
  const concerns: string[] = [];
  if (weightDelta !== null) highlights.push(tx(locale, "ci.hl.weight", { delta: `${weightDelta > 0 ? "+" : ""}${round(weightDelta, 1)}` }));
  if (current.trainingPlanned) highlights.push(tx(locale, "ci.hl.training", { done: current.trainingCompleted ?? 0, planned: current.trainingPlanned }));
  if (current.wins) highlights.push(tx(locale, "ci.hl.wins", { text: current.wins }));
  if (current.struggles) concerns.push(tx(locale, "ci.cc.struggles", { text: current.struggles }));
  if (current.frictionTags.length) concerns.push(tx(locale, "ci.cc.friction", { tags: current.frictionTags.map((t) => tx(locale, `friction.${t}`)).join(", ") }));

  return {
    progress,
    training,
    nutrition,
    recovery,
    mainIssue: mainKey ? tx(locale, `ci.issue.${mainKey}`) : null,
    coachingFocus: mainKey ? tx(locale, `ci.focus.${mainKey}`) : null,
    highlights,
    concerns,
  };
}
