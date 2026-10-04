/**
 * CLIENT MOMENTUM PROFILE
 *
 * A multidimensional, explainable view of whether a client is improving,
 * stable or declining. Not a scientific score: each dimension exposes the
 * data that produced it, and the overall status is a simple vote.
 */

import { tx } from "./catalog";
import { addDays, bestE1rmByExercise, clamp, completion, daysBetween, linearSlope, mean, pctChange, round, sessionsBetween } from "./stats";
import type { ClientSnapshot, Locale, Momentum, MomentumDimension, Trend } from "./types";

function trendOf(cur: number | null, prev: number | null, threshold: number): Trend {
  if (cur === null || prev === null) return "FLAT";
  if (cur - prev > threshold) return "UP";
  if (prev - cur > threshold) return "DOWN";
  return "FLAT";
}

function consistency(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const now = snap.now;
  const all = completion(sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, 1)), now);
  const cur = completion(sessionsBetween(snap.sessions, addDays(now, -14), addDays(now, 1)), now);
  const prev = completion(sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, -14)), now);
  if (all.planned < 2) return { key: "consistency", score: null, trend: "FLAT", explanation: tx(locale, "mom.nodata"), evidence: [] };
  return {
    key: "consistency",
    score: Math.round((all.rate ?? 0) * 100),
    trend: trendOf(cur.rate, prev.rate, 0.15),
    explanation: tx(locale, "mom.consistency.expl", { completed: all.completed, planned: all.planned }),
    evidence: [
      { label: tx(locale, "ev.rate14"), value: `${cur.completed}/${cur.planned}` },
      { label: tx(locale, "ev.ratePrev14"), value: `${prev.completed}/${prev.planned}` },
    ],
  };
}

function habitsRate(snap: ClientSnapshot, fromDays: number, toDays: number): { done: number; expected: number } {
  let done = 0;
  let expected = 0;
  const days = fromDays - toDays;
  for (const h of snap.habits) {
    expected += Math.round((Math.min(7, h.daysPerWeek) / 7) * days);
    done += h.logs.filter((l) => l.done && daysBetween(l.date, snap.now) < fromDays && daysBetween(l.date, snap.now) >= toDays).length;
  }
  return { done, expected };
}

function adherence(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const now = snap.now;
  const parts = (from: number, to: number): number | null => {
    const vals: number[] = [];
    const tr = completion(sessionsBetween(snap.sessions, addDays(now, -from), addDays(now, -to + 1)), now);
    if (tr.rate !== null) vals.push(tr.rate * 100);
    const hb = habitsRate(snap, from, to);
    if (hb.expected >= 3) vals.push(clamp((hb.done / hb.expected) * 100, 0, 100));
    const nut = snap.dailyLogs.filter((l) => l.nutritionAdherence !== null && daysBetween(l.date, now) < from && daysBetween(l.date, now) >= to).map((l) => ((l.nutritionAdherence! - 1) / 4) * 100);
    if (nut.length >= 3) vals.push(mean(nut)!);
    return vals.length ? mean(vals) : null;
  };
  const cur = parts(14, 0);
  const prev = parts(28, 14);
  if (cur === null) return { key: "adherence", score: null, trend: "FLAT", explanation: tx(locale, "mom.nodata"), evidence: [] };
  return {
    key: "adherence",
    score: Math.round(cur),
    trend: trendOf(cur, prev, 10),
    explanation: tx(locale, "mom.adherence.expl", { score: Math.round(cur) }),
    evidence: [
      { label: tx(locale, "ev.rate14"), value: `${Math.round(cur)}%` },
      { label: tx(locale, "ev.ratePrev14"), value: prev === null ? "–" : `${Math.round(prev)}%` },
    ],
  };
}

function performance(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const now = snap.now;
  const recent = bestE1rmByExercise(snap.sets, addDays(now, -28), addDays(now, 1));
  const before = bestE1rmByExercise(snap.sets, addDays(now, -56), addDays(now, -28));
  const deltas: { name: string; pct: number; cur: number; prev: number }[] = [];
  for (const [id, r] of recent) {
    const b = before.get(id);
    if (!b) continue;
    const pct = pctChange(b.e1rm, r.e1rm);
    if (pct !== null) deltas.push({ name: r.name, pct, cur: r.e1rm, prev: b.e1rm });
  }
  if (!deltas.length) return { key: "performance", score: null, trend: "FLAT", explanation: tx(locale, "mom.nodata"), evidence: [] };
  const avg = mean(deltas.map((d) => d.pct))!;
  const top = deltas.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  return {
    key: "performance",
    score: Math.round(clamp(50 + avg * 5, 0, 100)),
    trend: avg > 1.5 ? "UP" : avg < -1.5 ? "DOWN" : "FLAT",
    explanation: tx(locale, "mom.performance.expl", { exercise: top.name, delta: `${top.pct > 0 ? "+" : ""}${round(top.pct, 1)}` }),
    evidence: deltas.map((d) => ({ label: d.name, value: `${round(d.prev, 1)} → ${round(d.cur, 1)} kg` })),
  };
}

function recovery(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const now = snap.now;
  const score = (from: number, to: number) => {
    const logs = snap.dailyLogs.filter((l) => daysBetween(l.date, now) < from && daysBetween(l.date, now) >= to);
    if (logs.length < 3) return null;
    const vals: number[] = [];
    const e = mean(logs.map((l) => l.energy).filter((x): x is number => x !== null));
    const r = mean(logs.map((l) => l.perceivedRecovery).filter((x): x is number => x !== null));
    const so = mean(logs.map((l) => l.soreness).filter((x): x is number => x !== null));
    const st = mean(logs.map((l) => l.stress).filter((x): x is number => x !== null));
    const sl = mean(logs.map((l) => l.sleepHours).filter((x): x is number => x !== null));
    if (e !== null) vals.push(((e - 1) / 4) * 100);
    if (r !== null) vals.push(((r - 1) / 4) * 100);
    if (so !== null) vals.push(((5 - so) / 4) * 100);
    if (st !== null) vals.push(((5 - st) / 4) * 100);
    if (sl !== null) vals.push(clamp(((sl - 5) / 3) * 100, 0, 100));
    return { score: mean(vals), e, r, sl, n: logs.length };
  };
  const cur = score(7, 0);
  const prev = score(14, 7);
  if (!cur || cur.score === null) return { key: "recovery", score: null, trend: "FLAT", explanation: tx(locale, "mom.nodata"), evidence: [] };
  return {
    key: "recovery",
    score: Math.round(cur.score),
    trend: trendOf(cur.score, prev?.score ?? null, 10),
    explanation: tx(locale, "mom.recovery.expl", { energy: cur.e === null ? "–" : round(cur.e, 1), recovery: cur.r === null ? "–" : round(cur.r, 1), sleep: cur.sl === null ? "–" : round(cur.sl, 1) }),
    evidence: [
      { label: tx(locale, "ev.logs"), value: String(cur.n) },
      { label: tx(locale, "ev.ratePrev14"), value: prev?.score == null ? "–" : `${Math.round(prev.score)}%` },
    ],
  };
}

function habits(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const cur = habitsRate(snap, 14, 0);
  const prev = habitsRate(snap, 28, 14);
  if (cur.expected < 3) return { key: "habits", score: null, trend: "FLAT", explanation: tx(locale, "mom.nodata"), evidence: [] };
  const c = (cur.done / cur.expected) * 100;
  const p = prev.expected >= 3 ? (prev.done / prev.expected) * 100 : null;
  return {
    key: "habits",
    score: Math.round(clamp(c, 0, 100)),
    trend: trendOf(c, p, 12),
    explanation: tx(locale, "mom.habits.expl", { done: cur.done, expected: cur.expected }),
    evidence: [
      { label: tx(locale, "ev.habitsDone"), value: `${cur.done}/${cur.expected}` },
      { label: tx(locale, "ev.ratePrev14"), value: p === null ? "–" : `${Math.round(p)}%` },
    ],
  };
}

function engagement(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const now = snap.now;
  const ref = snap.client.lastActiveAt ?? snap.client.onboardedAt;
  const days = daysBetween(ref, now);
  const logs14 = snap.dailyLogs.filter((l) => daysBetween(l.date, now) < 14).length;
  const logsPrev = snap.dailyLogs.filter((l) => daysBetween(l.date, now) >= 14 && daysBetween(l.date, now) < 28).length;
  const recency = days <= 1 ? 100 : days <= 3 ? 80 : days <= 7 ? 50 : 20;
  const logging = clamp((logs14 / 14) * 100, 0, 100);
  const score = Math.round(recency * 0.5 + logging * 0.5);
  return {
    key: "engagement",
    score,
    trend: trendOf(logs14, logsPrev, 3),
    explanation: tx(locale, "mom.engagement.expl", { days, logs: logs14 }),
    evidence: [
      { label: tx(locale, "ev.lastActive"), value: `${days} j` },
      { label: tx(locale, "ev.logs"), value: `${logs14} / 14` },
    ],
  };
}

function goalProgress(snap: ClientSnapshot, locale: Locale): MomentumDimension {
  const goal = snap.goals.find((g) => g.isPrimary && g.status === "ACTIVE") ?? snap.goals.find((g) => g.status === "ACTIVE");
  const ms = snap.measurements.filter((m) => m.weightKg !== null);
  if (!goal || goal.metric !== "weightKg" || goal.startValue === null || goal.targetValue === null || ms.length < 2) {
    return { key: "goalProgress", score: null, trend: "FLAT", explanation: tx(locale, "mom.nodata"), evidence: [] };
  }
  const current = ms[ms.length - 1].weightKg!;
  const total = goal.startValue - goal.targetValue;
  const done = goal.startValue - current;
  const pct = total === 0 ? 100 : clamp((done / total) * 100, 0, 100);
  const recent = ms.filter((m) => daysBetween(m.date, snap.now) <= 14);
  let trend: Trend = "FLAT";
  if (recent.length >= 3) {
    const t0 = recent[0].date.getTime();
    const slope = linearSlope(recent.map((m) => ({ x: (m.date.getTime() - t0) / 86_400_000, y: m.weightKg! })));
    if (slope !== null) {
      const towards = Math.sign(total) === Math.sign(-slope) ? -slope * Math.sign(total) : 0;
      trend = towards > 0.02 ? "UP" : slope !== 0 && Math.sign(slope) === Math.sign(total) && Math.abs(slope) > 0.02 ? "DOWN" : "FLAT";
    }
  }
  return {
    key: "goalProgress",
    score: Math.round(pct),
    trend,
    explanation: tx(locale, "mom.goalProgress.expl", { pct: Math.round(pct), goal: goal.title }),
    evidence: [
      { label: tx(locale, "ev.goal"), value: `${goal.startValue} → ${goal.targetValue} kg` },
      { label: tx(locale, "ev.weightMax"), value: `${round(current, 1)} kg` },
    ],
  };
}

export function computeMomentum(snap: ClientSnapshot, locale: Locale = "fr"): Momentum {
  const dims: MomentumDimension[] = [consistency(snap, locale), adherence(snap, locale), performance(snap, locale), recovery(snap, locale), habits(snap, locale), engagement(snap, locale), goalProgress(snap, locale)];
  const withData = dims.filter((d) => d.score !== null);
  const up = withData.filter((d) => d.trend === "UP");
  const down = withData.filter((d) => d.trend === "DOWN");
  const flat = withData.length - up.length - down.length;
  let status: Momentum["status"];
  if (withData.length < 3) status = "INSUFFICIENT_DATA";
  else if (down.length >= 2 && down.length > up.length) status = "DECLINING";
  else if (up.length >= 2 && up.length > down.length) status = "IMPROVING";
  else status = "STABLE";
  const drivers = [...down, ...up].map((d) => `${tx(locale, `mom.${d.key}`)} ${d.trend === "UP" ? "↑" : "↓"}`).join(", ") || "–";
  return {
    status,
    summary: status === "INSUFFICIENT_DATA" ? tx(locale, "mom.status.INSUFFICIENT_DATA") : tx(locale, "mom.summary", { up: up.length, down: down.length, flat, drivers }),
    dimensions: dims,
  };
}
