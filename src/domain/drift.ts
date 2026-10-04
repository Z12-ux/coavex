/**
 * PROGRAM DRIFT DETECTION
 *
 * Compares the PLANNED program with ACTUAL behaviour and helps the coach
 * distinguish a bad program from bad adherence from real-life friction.
 */

import { tx } from "./catalog";
import { addDays, completion, effectiveStatus, round, sessionsBetween, weeklyTopLoad } from "./stats";
import type { ClientSnapshot, DriftItem, DriftReport, DriftVerdict, FrictionCategory, Locale } from "./types";

const LIFE: FrictionCategory[] = ["TIME", "SCHEDULE", "WORKLOAD", "ILLNESS"];
const PROGRAM: FrictionCategory[] = ["DIFFICULTY", "EQUIPMENT", "UNCLEAR", "RECOVERY"];

export function detectDrift(snap: ClientSnapshot, locale: Locale = "fr"): DriftReport {
  const now = snap.now;
  const items: DriftItem[] = [];
  const window = sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, 1));
  const c = completion(window, now);
  const plannedPerWeek = snap.program?.sessionsPerWeek ?? snap.client.plannedSessionsPerWeek;

  if (c.planned < 2 * Math.max(1, plannedPerWeek) * 0.5) {
    return {
      verdict: "INSUFFICIENT_DATA",
      headline: tx(locale, "drift.verdict.INSUFFICIENT_DATA"),
      rationale: tx(locale, "drift.rationale.INSUFFICIENT_DATA"),
      items,
    };
  }

  // FREQUENCY
  const actualPerWeek = c.completed / 4;
  const freqGap = plannedPerWeek ? ((actualPerWeek - plannedPerWeek) / plannedPerWeek) * 100 : null;
  items.push({
    aspect: "FREQUENCY",
    planned: tx(locale, "drift.FREQUENCY.planned", { n: plannedPerWeek }),
    actual: tx(locale, "drift.FREQUENCY.actual", { n: round(actualPerWeek, 1) }),
    gapPct: freqGap === null ? null : Math.round(freqGap),
    material: freqGap !== null && freqGap <= -25,
    explanation: freqGap !== null && freqGap <= -25 ? tx(locale, "drift.FREQUENCY.expl", { pct: Math.abs(Math.round(freqGap)) }) : tx(locale, "drift.rationale.ON_TRACK"),
  });

  // PROGRESSION
  if (snap.program && snap.program.progressionRule !== "MANUAL") {
    const loads = weeklyTopLoad(snap.sets, now, 4);
    let stagnantWeeks = 0;
    for (const [, { loads: ls }] of loads) {
      const present = ls.filter((x): x is number => x !== null);
      if (present.length >= 3 && present.every((x) => x === present[0])) stagnantWeeks = Math.max(stagnantWeeks, present.length);
    }
    const executing = (c.rate ?? 0) >= 0.7;
    const material = stagnantWeeks >= 3 && executing;
    items.push({
      aspect: "PROGRESSION",
      planned: tx(locale, "drift.PROGRESSION.planned", { rule: snap.program.progressionRule }),
      actual: stagnantWeeks >= 3 ? tx(locale, "drift.PROGRESSION.actual", { weeks: stagnantWeeks }) : tx(locale, "drift.PROGRESSION.ok"),
      gapPct: null,
      material,
      explanation: material ? tx(locale, "drift.PROGRESSION.expl") : tx(locale, "drift.rationale.ON_TRACK"),
    });
  }

  // HABITS
  if (snap.habits.length) {
    let plannedDays = 0;
    let doneDays = 0;
    for (const h of snap.habits) {
      plannedDays += Math.min(7, h.daysPerWeek);
      doneDays += h.logs.filter((l) => l.done && l.date >= addDays(now, -28)).length / 4;
    }
    const gap = plannedDays ? ((doneDays - plannedDays) / plannedDays) * 100 : null;
    items.push({
      aspect: "HABITS",
      planned: tx(locale, "drift.HABITS.planned", { n: plannedDays }),
      actual: tx(locale, "drift.HABITS.actual", { n: round(doneDays, 1) }),
      gapPct: gap === null ? null : Math.round(gap),
      material: gap !== null && gap <= -40,
      explanation: gap !== null && gap <= -40 ? tx(locale, "drift.HABITS.expl", { pct: Math.round(100 + gap) }) : tx(locale, "drift.rationale.ON_TRACK"),
    });
  }

  // DURATION
  const completed = window.filter((s) => effectiveStatus(s, now) === "COMPLETED");
  if (completed.length >= 3) {
    const shortened = completed.filter((s) => s.isShortened).length;
    const pct = (shortened / completed.length) * 100;
    items.push({
      aspect: "DURATION",
      planned: tx(locale, "drift.DURATION.planned"),
      actual: tx(locale, "drift.DURATION.actual", { pct: Math.round(pct) }),
      gapPct: -Math.round(pct),
      material: pct >= 40,
      explanation: pct >= 40 ? tx(locale, "drift.DURATION.expl") : tx(locale, "drift.rationale.ON_TRACK"),
    });
  }

  // Verdict
  const material = items.filter((i) => i.material);
  let verdict: DriftVerdict = "ON_TRACK";
  let rationale = tx(locale, "drift.rationale.ON_TRACK");
  if (material.length) {
    const missed = window.filter((s) => effectiveStatus(s, now) === "MISSED");
    const reasons = missed.map((s) => s.missedReason).filter((r): r is FrictionCategory => !!r);
    const life = reasons.filter((r) => LIFE.includes(r));
    const prog = reasons.filter((r) => PROGRAM.includes(r));
    const label = (rs: FrictionCategory[]) => [...new Set(rs)].map((r) => tx(locale, `friction.${r}`)).join(", ");
    const freqMaterial = material.some((i) => i.aspect === "FREQUENCY");
    const progMaterial = material.some((i) => i.aspect === "PROGRESSION");
    if (freqMaterial && reasons.length && life.length / reasons.length >= 0.5) {
      verdict = "LIFE_FRICTION";
      rationale = tx(locale, "drift.rationale.LIFE_FRICTION", { reasons: label(life) });
    } else if ((freqMaterial && reasons.length && prog.length / reasons.length >= 0.5) || (!freqMaterial && progMaterial)) {
      verdict = "PROGRAM_ISSUE";
      rationale = tx(locale, "drift.rationale.PROGRAM_ISSUE", { reasons: prog.length ? label(prog) : "–" });
    } else {
      verdict = "ADHERENCE_ISSUE";
      rationale = tx(locale, "drift.rationale.ADHERENCE_ISSUE");
    }
  }
  const headline = material.length ? tx(locale, "drift.headline", { aspects: material.map((i) => i.aspect.toLowerCase()).join(", ") }) : tx(locale, "drift.verdict.ON_TRACK");
  return { verdict, headline, rationale, items };
}
