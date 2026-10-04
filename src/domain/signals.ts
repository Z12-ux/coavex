/**
 * CLIENT SIGNAL ENGINE
 *
 * Detects meaningful changes in a client's data and explains each one:
 *   WHAT happened → WHY it may matter → WHAT DATA supports it → POSSIBLE next action.
 *
 * Rules are deliberately conservative: each signal requires a minimum amount
 * of data, states observations (never diagnoses), and carries the evidence
 * that produced it. Fingerprints make signals idempotent across recomputes.
 */

import { tx } from "./catalog";
import {
  addDays,
  bestE1rmByExercise,
  completion,
  daysBetween,
  effectiveStatus,
  isoDate,
  linearSlope,
  mean,
  pctChange,
  round,
  sessionsBetween,
  startOfDay,
  weekKey,
  weeklyCompletion,
  weeklyTopLoad,
} from "./stats";
import type { ClientSnapshot, Evidence, FrictionCategory, Locale, SignalDraft, SignalKey } from "./types";

type Ctx = { snap: ClientSnapshot; locale: Locale; now: Date; wk: string };

function ev(locale: Locale, labelKey: string, value: string | number): Evidence {
  return { label: tx(locale, labelKey), value: String(value) };
}

function make(
  ctx: Ctx,
  key: SignalKey,
  severity: SignalDraft["severity"],
  polarity: SignalDraft["polarity"],
  params: Record<string, string | number>,
  evidence: Evidence[],
  fingerprint: string,
): SignalDraft {
  const { locale } = ctx;
  return {
    key,
    severity,
    polarity,
    title: tx(locale, `sig.${key}.title`, params),
    what: tx(locale, `sig.${key}.what`, params),
    why: tx(locale, `sig.${key}.why`, params),
    suggestedAction: tx(locale, `sig.${key}.action`, params),
    evidence,
    fingerprint,
  };
}

// ───────────────────────────── individual detectors ─────────────────────────

function missedWorkouts(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const last7 = sessionsBetween(snap.sessions, addDays(now, -7), addDays(now, 1));
  const c = completion(last7, now);
  if (c.missed < 2) return null;
  const missedList = last7
    .filter((s) => effectiveStatus(s, now) === "MISSED")
    .map((s) => `${isoDate(s.scheduledFor)}${s.workoutName ? ` · ${s.workoutName}` : ""}${s.missedReason ? ` (${tx(locale, `friction.${s.missedReason}`)})` : ""}`);
  return make(
    ctx,
    "MISSED_WORKOUTS",
    c.missed >= 3 ? "URGENT" : "ATTENTION",
    "NEGATIVE",
    { n: c.missed, planned: c.planned },
    [ev(locale, "ev.missed", missedList.join("; ")), ev(locale, "ev.planned", c.planned), ev(locale, "ev.completed", c.completed)],
    `MISSED_WORKOUTS:${wk}`,
  );
}

function consistencyDrop(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const cur = completion(sessionsBetween(snap.sessions, addDays(now, -14), addDays(now, 1)), now);
  const prev = completion(sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, -14)), now);
  if (cur.planned < 3 || prev.planned < 3 || cur.rate === null || prev.rate === null) return null;
  if (prev.rate < 0.6 || cur.rate > prev.rate - 0.25) return null;
  return make(
    ctx,
    "TRAINING_CONSISTENCY_DROP",
    "ATTENTION",
    "NEGATIVE",
    { cur: `${Math.round(cur.rate * 100)}%`, prev: `${Math.round(prev.rate * 100)}%` },
    [
      ev(locale, "ev.rate14", `${cur.completed}/${cur.planned}`),
      ev(locale, "ev.ratePrev14", `${prev.completed}/${prev.planned}`),
    ],
    `TRAINING_CONSISTENCY_DROP:${wk}`,
  );
}

function adherenceDeclining(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const weeks = weeklyCompletion(snap.sessions, now, 4).filter((w) => w.planned > 0);
  if (weeks.length < 3) return null;
  const pts = weeks.map((w, i) => ({ x: i, y: w.rate ?? 0 }));
  const slope = linearSlope(pts);
  if (slope === null || slope > -0.08) return null;
  const series = weeks.map((w) => `${Math.round((w.rate ?? 0) * 100)}%`).join(" → ");
  return make(
    ctx,
    "ADHERENCE_DECLINING",
    "WATCH",
    "NEGATIVE",
    { weeks: weeks.length, series },
    [ev(locale, "ev.weekly", series), ev(locale, "ev.slope", `${round(slope * 100, 0)} pts/${tx(locale, "ev.weeks").toLowerCase()}`)],
    `ADHERENCE_DECLINING:${wk}`,
  );
}

function sleepDecline(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const cur = snap.dailyLogs.filter((l) => daysBetween(l.date, now) < 7 && l.sleepHours !== null).map((l) => l.sleepHours!);
  const prev = snap.dailyLogs
    .filter((l) => daysBetween(l.date, now) >= 7 && daysBetween(l.date, now) < 14 && l.sleepHours !== null)
    .map((l) => l.sleepHours!);
  if (cur.length < 4 || prev.length < 4) return null;
  const mc = mean(cur)!;
  const mp = mean(prev)!;
  const diff = mc - mp;
  if (diff > -0.75) return null;
  return make(
    ctx,
    "SLEEP_DECLINE",
    diff <= -1.25 ? "ATTENTION" : "WATCH",
    "NEGATIVE",
    { cur: round(mc, 1), prev: round(mp, 1) },
    [ev(locale, "ev.sleepCur", `${round(mc, 1)} h (${cur.length} ${tx(locale, "ev.logs").toLowerCase()})`), ev(locale, "ev.sleepPrev", `${round(mp, 1)} h (${prev.length})`)],
    `SLEEP_DECLINE:${wk}`,
  );
}

function recoveryLow(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const logs = snap.dailyLogs.filter((l) => daysBetween(l.date, now) < 7);
  if (logs.length < 4) return null;
  const energy = mean(logs.map((l) => l.energy).filter((x): x is number => x !== null));
  const recovery = mean(logs.map((l) => l.perceivedRecovery).filter((x): x is number => x !== null));
  const soreness = mean(logs.map((l) => l.soreness).filter((x): x is number => x !== null));
  const low = (energy !== null && energy <= 2.5) || (recovery !== null && recovery <= 2.5) || (soreness !== null && soreness >= 4);
  if (!low) return null;
  return make(
    ctx,
    "RECOVERY_LOW",
    "WATCH",
    "NEGATIVE",
    { energy: energy === null ? "–" : round(energy, 1), recovery: recovery === null ? "–" : round(recovery, 1), soreness: soreness === null ? "–" : round(soreness, 1) },
    [
      ev(locale, "ev.energy", energy === null ? "–" : `${round(energy, 1)}/5`),
      ev(locale, "ev.recovery", recovery === null ? "–" : `${round(recovery, 1)}/5`),
      ev(locale, "ev.soreness", soreness === null ? "–" : `${round(soreness, 1)}/5`),
      ev(locale, "ev.logs", logs.length),
    ],
    `RECOVERY_LOW:${wk}`,
  );
}

function stressHigh(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const logs = snap.dailyLogs.filter((l) => daysBetween(l.date, now) < 7 && l.stress !== null);
  if (logs.length < 4) return null;
  const stress = mean(logs.map((l) => l.stress!))!;
  if (stress < 4) return null;
  return make(ctx, "STRESS_HIGH", "WATCH", "NEGATIVE", { stress: round(stress, 1) }, [ev(locale, "ev.stress", `${round(stress, 1)}/5`), ev(locale, "ev.logs", logs.length)], `STRESS_HIGH:${wk}`);
}

function weightPlateau(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const goal = snap.goals.find((g) => g.isPrimary && g.status === "ACTIVE") ?? snap.goals[0];
  if (!goal || !["FAT_LOSS", "MUSCLE_GAIN"].includes(goal.type)) return null;
  const ms = snap.measurements.filter((m) => m.weightKg !== null && daysBetween(m.date, now) <= 35);
  if (ms.length < 4) return null;
  const first = ms[0];
  const span = daysBetween(first.date, ms[ms.length - 1].date);
  if (span < 18) return null;
  const ws = ms.map((m) => m.weightKg!);
  const min = Math.min(...ws);
  const max = Math.max(...ws);
  const avg = mean(ws)!;
  if ((max - min) / avg > 0.008) return null;
  return make(
    ctx,
    "WEIGHT_PLATEAU",
    "WATCH",
    "NEGATIVE",
    { range: round(max - min, 1), days: span, n: ms.length },
    [ev(locale, "ev.weightMin", `${round(min, 1)} kg`), ev(locale, "ev.weightMax", `${round(max, 1)} kg`), ev(locale, "ev.span", `${span} j`), ev(locale, "ev.goal", goal.title)],
    `WEIGHT_PLATEAU:${wk}`,
  );
}

function weightAgainstGoal(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const goal = snap.goals.find((g) => g.isPrimary && g.status === "ACTIVE") ?? snap.goals[0];
  if (!goal || !["FAT_LOSS", "MUSCLE_GAIN"].includes(goal.type)) return null;
  const ms = snap.measurements.filter((m) => m.weightKg !== null && daysBetween(m.date, now) <= 14);
  if (ms.length < 4) return null;
  const t0 = ms[0].date.getTime();
  const slopePerDay = linearSlope(ms.map((m) => ({ x: (m.date.getTime() - t0) / 86_400_000, y: m.weightKg! })));
  if (slopePerDay === null) return null;
  const perWeek = slopePerDay * 7;
  const against = (goal.type === "FAT_LOSS" && perWeek > 0.15) || (goal.type === "MUSCLE_GAIN" && perWeek < -0.15);
  if (!against) return null;
  return make(
    ctx,
    "WEIGHT_TREND_AGAINST_GOAL",
    "WATCH",
    "NEGATIVE",
    { slope: `${perWeek > 0 ? "+" : ""}${round(perWeek, 2)}`, goal: goal.title },
    [ev(locale, "ev.slope", `${perWeek > 0 ? "+" : ""}${round(perWeek, 2)} kg/sem`), ev(locale, "ev.goal", goal.title), ev(locale, "ev.logs", ms.length)],
    `WEIGHT_TREND_AGAINST_GOAL:${wk}`,
  );
}

function performanceUp(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const recent = bestE1rmByExercise(snap.sets, addDays(now, -14), addDays(now, 1));
  const before = bestE1rmByExercise(snap.sets, addDays(now, -42), addDays(now, -14));
  let best: { name: string; cur: number; prev: number; pct: number } | null = null;
  for (const [id, r] of recent) {
    const b = before.get(id);
    if (!b) continue;
    const pct = pctChange(b.e1rm, r.e1rm);
    if (pct !== null && pct >= 2.5 && (!best || pct > best.pct)) best = { name: r.name, cur: r.e1rm, prev: b.e1rm, pct };
  }
  if (!best) return null;
  const ws = snap.measurements.filter((m) => m.weightKg !== null && daysBetween(m.date, now) <= 42).map((m) => m.weightKg!);
  const stableWeight = ws.length >= 3 && (Math.max(...ws) - Math.min(...ws)) / mean(ws)! < 0.015;
  const weightNote = stableWeight ? (locale === "fr" ? " à poids stable" : locale === "ar" ? " مع ثبات الوزن" : " at stable body weight") : "";
  return make(
    ctx,
    "PERFORMANCE_UP",
    "INFO",
    "POSITIVE",
    { exercise: best.name, cur: round(best.cur, 1), prev: round(best.prev, 1), pct: round(best.pct, 1), weightNote },
    [ev(locale, "ev.e1rmCur", `${round(best.cur, 1)} kg`), ev(locale, "ev.e1rmPrev", `${round(best.prev, 1)} kg`)],
    `PERFORMANCE_UP:${best.name}:${wk}`,
  );
}

function loadStagnant(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  if (snap.program && snap.program.progressionRule === "MANUAL") return null;
  const done = completion(sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, 1)), now);
  if (done.planned < 4 || (done.rate ?? 0) < 0.7) return null;
  const loads = weeklyTopLoad(snap.sets, now, 4);
  for (const [, { name, loads: ls }] of loads) {
    const present = ls.filter((x): x is number => x !== null);
    if (present.length < 3) continue;
    if (present.every((x) => x === present[0])) {
      return make(
        ctx,
        "LOAD_STAGNANT",
        "WATCH",
        "NEGATIVE",
        { exercise: name, load: present[0], weeks: present.length },
        [ev(locale, "ev.load", `${present[0]} kg`), ev(locale, "ev.weeks", present.length), ev(locale, "ev.completed", `${done.completed}/${done.planned}`)],
        `LOAD_STAGNANT:${name}:${wk}`,
      );
    }
  }
  return null;
}

function engagementLow(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  if (!["ACTIVE", "TRIAL"].includes(snap.client.status)) return null;
  const ref = snap.client.lastActiveAt ?? snap.client.onboardedAt;
  const days = daysBetween(ref, now);
  if (days < 5) return null;
  return make(
    ctx,
    "ENGAGEMENT_LOW",
    days >= 10 ? "ATTENTION" : "WATCH",
    "NEGATIVE",
    { days },
    [ev(locale, "ev.lastActive", snap.client.lastActiveAt ? isoDate(snap.client.lastActiveAt) : tx(locale, "ev.none"))],
    `ENGAGEMENT_LOW:${wk}`,
  );
}

/** Most recent date (≤ now) that falls on the client's check-in weekday. */
export function lastExpectedCheckIn(now: Date, weekday: number): Date {
  const d = startOfDay(now);
  const diff = (d.getDay() - weekday + 7) % 7;
  return addDays(d, -diff);
}

function checkInOverdue(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  if (!["ACTIVE", "TRIAL"].includes(snap.client.status)) return null;
  if (daysBetween(snap.client.onboardedAt, now) < 7) return null;
  const expected = lastExpectedCheckIn(now, snap.client.checkInWeekday);
  const late = daysBetween(expected, now);
  if (late < 2) return null;
  const window = addDays(expected, -3);
  const submitted = snap.checkIns.some((c) => c.submittedAt && c.submittedAt >= window);
  if (submitted) return null;
  const prevExpected = addDays(expected, -7);
  const prevSubmitted = snap.checkIns.some((c) => c.submittedAt && c.submittedAt >= addDays(prevExpected, -3) && c.submittedAt < window);
  const last = snap.checkIns.filter((c) => c.submittedAt).at(-1);
  return make(
    ctx,
    "CHECKIN_OVERDUE",
    prevSubmitted ? "ATTENTION" : "URGENT",
    "NEGATIVE",
    { expected: isoDate(expected), days: late },
    [ev(locale, "ev.expected", isoDate(expected)), ev(locale, "ev.lastCheckIn", last?.submittedAt ? isoDate(last.submittedAt) : tx(locale, "ev.none"))],
    `CHECKIN_OVERDUE:${wk}`,
  );
}

function habitLow(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  let done = 0;
  let expected = 0;
  for (const h of snap.habits) {
    const exp = Math.min(7, h.daysPerWeek);
    expected += exp;
    done += h.logs.filter((l) => l.done && daysBetween(l.date, now) < 7).length;
  }
  if (expected < 3) return null;
  const pct = (done / expected) * 100;
  if (pct >= 50) return null;
  return make(ctx, "HABIT_LOW", "WATCH", "NEGATIVE", { done, expected, pct: Math.round(pct) }, [ev(locale, "ev.habitsDone", `${done}/${expected}`), ev(locale, "ev.adherence", `${Math.round(pct)}%`)], `HABIT_LOW:${wk}`);
}

function nutritionLow(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const logs = snap.dailyLogs.filter((l) => daysBetween(l.date, now) < 7 && l.nutritionAdherence !== null);
  const lastCi = snap.checkIns.filter((c) => c.submittedAt).at(-1);
  let score: number | null = null;
  let source = "";
  if (logs.length >= 3) {
    score = mean(logs.map((l) => l.nutritionAdherence!));
    source = `${logs.length} ${tx(locale, "ev.logs").toLowerCase()}`;
  } else if (lastCi?.nutritionAdherence !== null && lastCi?.nutritionAdherence !== undefined && daysBetween(lastCi.submittedAt!, now) <= 10) {
    score = lastCi.nutritionAdherence;
    source = tx(locale, "ev.lastCheckIn").toLowerCase();
  }
  if (score === null || score > 2.5) return null;
  return make(ctx, "NUTRITION_ADHERENCE_LOW", "WATCH", "NEGATIVE", { score: round(score, 1), source }, [ev(locale, "ev.adherence", `${round(score, 1)}/5`), ev(locale, "ev.logs", source)], `NUTRITION_ADHERENCE_LOW:${wk}`);
}

function noActiveProgram(ctx: Ctx): SignalDraft | null {
  const { snap, locale } = ctx;
  if (!["ACTIVE", "TRIAL"].includes(snap.client.status)) return null;
  if (snap.program) return null;
  return make(ctx, "NO_ACTIVE_PROGRAM", "ATTENTION", "NEGATIVE", {}, [ev(locale, "ev.since", isoDate(snap.client.onboardedAt))], "NO_ACTIVE_PROGRAM");
}

function onboardingStalled(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale } = ctx;
  if (snap.client.status !== "ONBOARDING") return null;
  const days = daysBetween(snap.client.onboardedAt, now);
  if (days < 7) return null;
  return make(ctx, "ONBOARDING_STALLED", "ATTENTION", "NEGATIVE", { days }, [ev(locale, "ev.since", isoDate(snap.client.onboardedAt))], "ONBOARDING_STALLED");
}

function paymentOverdue(ctx: Ctx): SignalDraft[] {
  const { snap, now, locale } = ctx;
  const out: SignalDraft[] = [];
  for (const p of snap.payments) {
    if (p.paidAt) continue;
    const late = daysBetween(p.dueAt, now);
    if (p.status !== "OVERDUE" && late < 3) continue;
    out.push(
      make(
        ctx,
        "PAYMENT_OVERDUE",
        late >= 14 ? "URGENT" : "ATTENTION",
        "NEGATIVE",
        { amount: p.amount.toLocaleString("fr-DZ"), currency: "DA", due: isoDate(p.dueAt), days: Math.max(0, late) },
        [ev(locale, "ev.amount", `${p.amount.toLocaleString("fr-DZ")} DA`), ev(locale, "ev.dueAt", isoDate(p.dueAt))],
        `PAYMENT_OVERDUE:${p.id}`,
      ),
    );
  }
  return out;
}

function subscriptionEnding(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale } = ctx;
  const s = snap.subscription;
  if (!s || s.status !== "ACTIVE" || !s.endDate) return null;
  const days = daysBetween(now, s.endDate);
  if (days < 0 || days > 14) return null;
  return make(ctx, "SUBSCRIPTION_ENDING", "INFO", "NEUTRAL", { pkg: s.packageName, end: isoDate(s.endDate), days }, [ev(locale, "ev.endDate", isoDate(s.endDate))], `SUBSCRIPTION_ENDING:${isoDate(s.endDate)}`);
}

function milestoneReached(ctx: Ctx): SignalDraft[] {
  const { snap, now, locale } = ctx;
  return snap.milestones
    .filter((m) => daysBetween(m.reachedAt, now) <= 7)
    .map((m) =>
      make(ctx, "MILESTONE_REACHED", "INFO", "POSITIVE", { title: m.title, when: isoDate(m.reachedAt) }, [ev(locale, "ev.since", isoDate(m.reachedAt))], `MILESTONE_REACHED:${m.title}:${isoDate(m.reachedAt)}`),
    );
}

function consistencyStreak(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const weeks = weeklyCompletion(snap.sessions, now, 3);
  if (!weeks.every((w) => w.planned >= 2 && (w.rate ?? 0) >= 0.9)) return null;
  const series = weeks.map((w) => `${w.completed}/${w.planned}`).join(" · ");
  return make(ctx, "CONSISTENCY_STREAK", "INFO", "POSITIVE", { weeks: 3 }, [ev(locale, "ev.weekly", series)], `CONSISTENCY_STREAK:${wk}`);
}

function unansweredMessage(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale } = ctx;
  const sorted = [...snap.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const last = sorted.at(-1);
  if (!last || last.direction !== "CLIENT_TO_COACH") return null;
  const hours = Math.floor((now.getTime() - last.createdAt.getTime()) / 3_600_000);
  if (hours < 24) return null;
  return make(ctx, "UNANSWERED_MESSAGE", hours >= 48 ? "URGENT" : "ATTENTION", "NEGATIVE", { hours }, [ev(locale, "ev.lastMessage", isoDate(last.createdAt))], `UNANSWERED_MESSAGE:${last.createdAt.toISOString()}`);
}

function frictionPattern(ctx: Ctx): SignalDraft | null {
  const { snap, now, locale, wk } = ctx;
  const counts = new Map<FrictionCategory, number>();
  for (const s of sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, 1))) {
    if (effectiveStatus(s, now) !== "MISSED" || !s.missedReason) continue;
    counts.set(s.missedReason, (counts.get(s.missedReason) ?? 0) + 1);
  }
  let top: [FrictionCategory, number] | null = null;
  for (const e of counts) if (!top || e[1] > top[1]) top = e;
  if (!top || top[1] < 3) return null;
  const label = tx(locale, `friction.${top[0]}`);
  return make(ctx, "FRICTION_PATTERN", "WATCH", "NEGATIVE", { n: top[1], category: label }, [ev(locale, "ev.reason", label), ev(locale, "ev.missed", top[1])], `FRICTION_PATTERN:${top[0]}:${wk}`);
}

// ───────────────────────────── public API ───────────────────────────────────

const SEVERITY_ORDER: Record<SignalDraft["severity"], number> = { URGENT: 3, ATTENTION: 2, WATCH: 1, INFO: 0 };

export function detectSignals(snap: ClientSnapshot, locale: Locale = "fr"): SignalDraft[] {
  const now = snap.now;
  const ctx: Ctx = { snap, locale, now, wk: weekKey(now) };
  const out: SignalDraft[] = [];
  const push = (s: SignalDraft | SignalDraft[] | null) => {
    if (!s) return;
    if (Array.isArray(s)) out.push(...s);
    else out.push(s);
  };
  if (snap.client.status === "CHURNED" || snap.client.status === "PAUSED") {
    push(paymentOverdue(ctx));
    push(unansweredMessage(ctx));
    return out;
  }
  push(onboardingStalled(ctx));
  push(noActiveProgram(ctx));
  push(missedWorkouts(ctx));
  push(consistencyDrop(ctx));
  push(adherenceDeclining(ctx));
  push(sleepDecline(ctx));
  push(recoveryLow(ctx));
  push(stressHigh(ctx));
  push(weightPlateau(ctx));
  push(weightAgainstGoal(ctx));
  push(performanceUp(ctx));
  push(loadStagnant(ctx));
  push(engagementLow(ctx));
  push(checkInOverdue(ctx));
  push(habitLow(ctx));
  push(nutritionLow(ctx));
  push(paymentOverdue(ctx));
  push(subscriptionEnding(ctx));
  push(milestoneReached(ctx));
  push(consistencyStreak(ctx));
  push(unansweredMessage(ctx));
  push(frictionPattern(ctx));
  return out.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
}

export function severityRank(s: SignalDraft["severity"]): number {
  return SEVERITY_ORDER[s];
}
