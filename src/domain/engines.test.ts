import { describe, expect, it } from "vitest";
import { deriveActions } from "./actions";
import { tx } from "./catalog";
import { summarizeCheckIn } from "./checkin";
import { composeMessage } from "./communication";
import { detectDrift } from "./drift";
import { baseSnapshot, buildDailyLogs, buildSessions, buildSets, buildWeights, NOW } from "./fixtures";
import { computeFriction } from "./friction";
import { computeMomentum } from "./momentum";
import { deloadSuggestion, missedSessionOptions, suggestProgression } from "./program";
import { buildWeeklyReview } from "./review";
import { detectSignals, lastExpectedCheckIn } from "./signals";
import { addDays, completion, e1rm, isoDate, linearSlope, startOfWeek } from "./stats";
import type { SnapshotCheckIn } from "./types";

const keys = (snap: ReturnType<typeof baseSnapshot>) => detectSignals(snap).map((s) => s.key);

describe("stats", () => {
  it("computes Epley e1rm and slopes", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(Math.round(e1rm(100, 10))).toBe(133);
    expect(linearSlope([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }])).toBe(2);
    expect(linearSlope([{ x: 0, y: 1 }])).toBeNull();
  });
  it("treats old scheduled sessions as missed", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 1, perWeek: 4, completion: 1 }) });
    const c = completion(snap.sessions, NOW);
    expect(c.planned).toBeGreaterThan(0);
    expect(startOfWeek(NOW).getDay()).toBe(0);
  });
});

describe("signal engine", () => {
  it("flags missed workouts with evidence and a stable fingerprint", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: [1, 1, 1, 0], missedReason: "TIME" }) });
    const sigs = detectSignals(snap);
    const s = sigs.find((x) => x.key === "MISSED_WORKOUTS");
    expect(s).toBeDefined();
    expect(s!.evidence.length).toBeGreaterThan(0);
    expect(s!.what).toContain("manquée");
    expect(s!.fingerprint).toBe(`MISSED_WORKOUTS:${isoDate(startOfWeek(NOW))}`);
    // recompute → same fingerprint
    expect(detectSignals(snap).find((x) => x.key === "MISSED_WORKOUTS")!.fingerprint).toBe(s!.fingerprint);
  });

  it("detects a consistency drop and declining adherence", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 5, perWeek: 4, completion: [1, 1, 0.9, 0.3, 0.2], seed: 7 }) });
    const k = keys(snap);
    expect(k).toContain("TRAINING_CONSISTENCY_DROP");
    expect(k).toContain("ADHERENCE_DECLINING");
  });

  it("detects a sleep decline only with enough logs", () => {
    const logs = buildDailyLogs({ days: 14, sleep: (d) => (d >= 7 ? 7.5 : 6.0) });
    expect(keys(baseSnapshot({ dailyLogs: logs, sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }) }))).toContain("SLEEP_DECLINE");
    expect(keys(baseSnapshot({ dailyLogs: logs.slice(-5), sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }) }))).not.toContain("SLEEP_DECLINE");
  });

  it("detects a weight plateau for a fat-loss goal but not for a health goal", () => {
    const flat = buildWeights({ start: 88, perWeek: 0, days: 24, every: 3, noise: 0.2 });
    const snap = baseSnapshot({ measurements: flat, sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }) });
    expect(keys(snap)).toContain("WEIGHT_PLATEAU");
    const health = baseSnapshot({ measurements: flat, goals: [{ ...snap.goals[0], type: "HEALTH" }], sessions: snap.sessions });
    expect(keys(health)).not.toContain("WEIGHT_PLATEAU");
  });

  it("flags weight moving against the goal", () => {
    const up = buildWeights({ start: 90, perWeek: 0.4, days: 14, every: 2, noise: 0.1 });
    expect(keys(baseSnapshot({ measurements: up, sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }) }))).toContain("WEIGHT_TREND_AGAINST_GOAL");
  });

  it("recognises performance improvement (positive) and stagnant load (negative)", () => {
    const sessions = buildSessions({ weeks: 6, perWeek: 4, completion: 1 });
    const up = baseSnapshot({ sessions, sets: buildSets({ exerciseId: "sq", name: "Squat", loads: [80, 82.5, 85, 87.5, 90, 92.5] }) });
    const s = detectSignals(up).find((x) => x.key === "PERFORMANCE_UP");
    expect(s?.polarity).toBe("POSITIVE");
    const flat = baseSnapshot({ sessions, sets: buildSets({ exerciseId: "sq", name: "Squat", loads: [80, 80, 80, 80] }) });
    expect(keys(flat)).toContain("LOAD_STAGNANT");
    expect(keys(baseSnapshot({ ...flat, program: { ...flat.program!, progressionRule: "MANUAL" } }))).not.toContain("LOAD_STAGNANT");
  });

  it("flags low engagement, overdue check-in, unanswered message", () => {
    const snap = baseSnapshot({
      client: { ...baseSnapshot().client, lastActiveAt: addDays(NOW, -12), checkInWeekday: 4 },
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }),
      messages: [{ direction: "CLIENT_TO_COACH", createdAt: addDays(NOW, -3), readAt: null }],
    });
    const sigs = detectSignals(snap);
    expect(sigs.find((s) => s.key === "ENGAGEMENT_LOW")?.severity).toBe("ATTENTION");
    expect(sigs.find((s) => s.key === "UNANSWERED_MESSAGE")?.severity).toBe("URGENT");
    expect(keys(snap)).toContain("CHECKIN_OVERDUE");
    // submitting the check-in clears it
    const ci: SnapshotCheckIn = { id: "ci", weekStart: startOfWeek(NOW), status: "SUBMITTED", submittedAt: NOW, weightKg: 88, sleepAvgHours: 7, energy: 4, soreness: 2, stress: 2, trainingCompleted: 4, trainingPlanned: 4, nutritionAdherence: 4, habitAdherencePct: 80, wins: null, struggles: null, frictionTags: [], freeText: null, coachReviewedAt: null };
    expect(keys({ ...snap, checkIns: [ci] })).not.toContain("CHECKIN_OVERDUE");
  });

  it("computes the expected check-in day", () => {
    // NOW is a Monday (2026-09-28); weekday 0 (Sunday) → 2026-09-27
    expect(isoDate(lastExpectedCheckIn(NOW, 0))).toBe("2026-09-27");
    expect(isoDate(lastExpectedCheckIn(NOW, 1))).toBe("2026-09-28");
    expect(isoDate(lastExpectedCheckIn(NOW, 4))).toBe("2026-09-24");
  });

  it("flags business signals: payment overdue, subscription ending", () => {
    const snap = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }),
      payments: [{ id: "pay1", dueAt: addDays(NOW, -10), paidAt: null, status: "PENDING", amount: 12000 }],
      subscription: { status: "ACTIVE", endDate: addDays(NOW, 10), packageName: "Coaching" },
    });
    const k = keys(snap);
    expect(k).toContain("PAYMENT_OVERDUE");
    expect(k).toContain("SUBSCRIPTION_ENDING");
  });

  it("flags recurring friction and no active program / stalled onboarding", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 0.4, missedReason: "SCHEDULE", seed: 3 }) });
    expect(keys(snap)).toContain("FRICTION_PATTERN");
    expect(keys(baseSnapshot({ program: null }))).toContain("NO_ACTIVE_PROGRAM");
    expect(keys(baseSnapshot({ client: { ...baseSnapshot().client, status: "ONBOARDING", onboardedAt: addDays(NOW, -10) } }))).toContain("ONBOARDING_STALLED");
  });

  it("rewards a consistency streak and recent milestones", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }), milestones: [{ kind: "PR", title: "Squat 100 kg", reachedAt: addDays(NOW, -2) }] });
    const k = keys(snap);
    expect(k).toContain("CONSISTENCY_STREAK");
    expect(k).toContain("MILESTONE_REACHED");
  });

  it("stays quiet for a churned client except money and messages", () => {
    const snap = baseSnapshot({ client: { ...baseSnapshot().client, status: "CHURNED" }, sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 0 }) });
    expect(keys(snap)).toEqual([]);
  });

  it("localises output in Arabic and English", () => {
    const snap = baseSnapshot({ program: null });
    expect(detectSignals(snap, "ar")[0].title).toBe("لا برنامج نشط");
    expect(detectSignals(snap, "en")[0].title).toBe("No active program");
    expect(tx("fr", "unknown.key")).toBe("unknown.key");
  });
});

describe("next best action", () => {
  it("merges missed workouts + sleep decline into one recovery-first action", () => {
    const snap = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: [1, 1, 1, 0] }),
      dailyLogs: buildDailyLogs({ days: 14, sleep: (d) => (d >= 7 ? 7.5 : 5.8) }),
    });
    const actions = deriveActions(detectSignals(snap), snap);
    expect(actions[0].kind).toBe("REVIEW_RECOVERY");
    expect(actions[0].sourceSignalKeys).toEqual(expect.arrayContaining(["MISSED_WORKOUTS", "SLEEP_DECLINE"]));
    expect(actions.some((a) => a.kind === "REVIEW_MISSED")).toBe(false);
  });

  it("returns an explicit NO_ACTION for a client progressing normally", () => {
    const snap = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }),
      dailyLogs: buildDailyLogs({ days: 14, sleep: 7.5 }),
      measurements: buildWeights({ start: 90, perWeek: -0.4, days: 28 }),
      checkIns: [{ id: "ci", weekStart: startOfWeek(NOW), status: "REVIEWED", submittedAt: addDays(NOW, -1), weightKg: 88, sleepAvgHours: 7.5, energy: 4, soreness: 2, stress: 2, trainingCompleted: 4, trainingPlanned: 4, nutritionAdherence: 4, habitAdherencePct: 90, wins: null, struggles: null, frictionTags: [], freeText: null, coachReviewedAt: NOW }],
    });
    const sigs = detectSignals(snap);
    expect(sigs.filter((s) => s.polarity === "NEGATIVE")).toEqual([]);
    const actions = deriveActions(sigs, snap);
    expect(actions.map((a) => a.kind)).toContain("NO_ACTION");
    expect(actions[0].kind).toBe("CELEBRATE");
  });

  it("ranks an unanswered message and missing program above the rest", () => {
    const snap = baseSnapshot({ program: null, messages: [{ direction: "CLIENT_TO_COACH", createdAt: addDays(NOW, -3), readAt: null }] });
    const actions = deriveActions(detectSignals(snap), snap);
    expect(actions[0].kind).toBe("REPLY_MESSAGE");
    expect(actions[1].kind).toBe("CREATE_PROGRAM");
  });

  it("adds a REVIEW_CHECKIN action for a submitted, unreviewed check-in", () => {
    const snap = baseSnapshot({ checkIns: [{ id: "ci9", weekStart: startOfWeek(NOW), status: "SUBMITTED", submittedAt: NOW, weightKg: null, sleepAvgHours: null, energy: null, soreness: null, stress: null, trainingCompleted: null, trainingPlanned: null, nutritionAdherence: null, habitAdherencePct: null, wins: null, struggles: null, frictionTags: [], freeText: null, coachReviewedAt: null }] });
    const a = deriveActions(detectSignals(snap), snap).find((x) => x.kind === "REVIEW_CHECKIN");
    expect(a?.fingerprint).toContain("ci9");
  });
});

describe("momentum", () => {
  it("declines when several dimensions drop, improves when they rise", () => {
    const declining = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: [1, 1, 0.5, 0.25] }),
      dailyLogs: buildDailyLogs({ days: 14, sleep: (d) => (d >= 7 ? 7.5 : 6), energy: 2, recovery: 2 }).map((l, i, arr) => (i < arr.length / 2 ? { ...l, energy: 4, perceivedRecovery: 4 } : l)),
      habits: [{ id: "h", name: "Pas", kind: "STEPS", daysPerWeek: 7, logs: Array.from({ length: 28 }, (_, i) => ({ date: addDays(NOW, -i), done: i >= 14, value: 0 })) }],
    });
    const m = computeMomentum(declining);
    expect(m.status).toBe("DECLINING");
    expect(m.dimensions.find((d) => d.key === "consistency")?.trend).toBe("DOWN");
    expect(m.dimensions.every((d) => d.explanation.length > 0)).toBe(true);

    const improving = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: [0.25, 0.5, 1, 1] }),
      sets: buildSets({ exerciseId: "sq", name: "Squat", loads: [80, 80, 80, 80, 90, 92.5, 95, 97.5] }),
      habits: [{ id: "h", name: "Pas", kind: "STEPS", daysPerWeek: 7, logs: Array.from({ length: 28 }, (_, i) => ({ date: addDays(NOW, -i), done: i < 14, value: 0 })) }],
    });
    expect(computeMomentum(improving).status).toBe("IMPROVING");
  });

  it("reports insufficient data for a brand-new client", () => {
    expect(computeMomentum(baseSnapshot()).status).toBe("INSUFFICIENT_DATA");
  });

  it("measures goal progress from weight", () => {
    const snap = baseSnapshot({ measurements: buildWeights({ start: 92, perWeek: -0.5, days: 56, noise: 0.1 }) });
    const g = computeMomentum(snap).dimensions.find((d) => d.key === "goalProgress")!;
    expect(g.score).toBeGreaterThan(40);
    expect(g.trend).toBe("UP");
  });
});

describe("program drift", () => {
  it("attributes under-frequency to life friction when reasons are time/schedule", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 0.5, missedReason: "TIME", seed: 5 }) });
    const d = detectDrift(snap);
    expect(d.verdict).toBe("LIFE_FRICTION");
    expect(d.items.find((i) => i.aspect === "FREQUENCY")?.material).toBe(true);
  });
  it("attributes it to the program when reasons are difficulty/equipment", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 0.5, missedReason: "DIFFICULTY", seed: 5 }) });
    expect(detectDrift(snap).verdict).toBe("PROGRAM_ISSUE");
  });
  it("attributes it to adherence when no reason is given", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 0.5, seed: 5 }) });
    expect(detectDrift(snap).verdict).toBe("ADHERENCE_ISSUE");
  });
  it("flags a program issue when sessions are done but load never moves", () => {
    const snap = baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }), sets: buildSets({ exerciseId: "sq", name: "Squat", loads: [80, 80, 80, 80] }) });
    const d = detectDrift(snap);
    expect(d.verdict).toBe("PROGRAM_ISSUE");
    expect(d.items.find((i) => i.aspect === "PROGRESSION")?.material).toBe(true);
  });
  it("is on track otherwise and reports insufficient data for new clients", () => {
    expect(detectDrift(baseSnapshot({ sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 1 }), sets: buildSets({ exerciseId: "sq", name: "Squat", loads: [80, 82.5, 85, 87.5] }) })).verdict).toBe("ON_TRACK");
    expect(detectDrift(baseSnapshot()).verdict).toBe("INSUFFICIENT_DATA");
  });
});

describe("friction engine", () => {
  it("aggregates reasons and proposes questions", () => {
    const snap = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: 0.4, missedReason: (i) => (i % 3 === 0 ? "MOTIVATION" : "TIME"), seed: 9 }),
      checkIns: [{ id: "c", weekStart: startOfWeek(NOW), status: "SUBMITTED", submittedAt: NOW, weightKg: null, sleepAvgHours: null, energy: null, soreness: null, stress: null, trainingCompleted: null, trainingPlanned: null, nutritionAdherence: null, habitAdherencePct: null, wins: null, struggles: null, frictionTags: ["TIME"], freeText: null, coachReviewedAt: null }],
    });
    const f = computeFriction(snap);
    expect(f.top[0].category).toBe("TIME");
    expect(f.pattern).toContain("Manque de temps");
    expect(f.questions[0]).toContain("30 minutes");
  });
  it("falls back to a generic question", () => {
    expect(computeFriction(baseSnapshot()).questions).toHaveLength(1);
  });
});

describe("check-in summary", () => {
  const prev: SnapshotCheckIn = { id: "a", weekStart: addDays(startOfWeek(NOW), -7), status: "REVIEWED", submittedAt: addDays(NOW, -7), weightKg: 90, sleepAvgHours: 7.5, energy: 4, soreness: 2, stress: 2, trainingCompleted: 4, trainingPlanned: 4, nutritionAdherence: 4, habitAdherencePct: 80, wins: null, struggles: null, frictionTags: [], freeText: null, coachReviewedAt: NOW };
  const cur: SnapshotCheckIn = { ...prev, id: "b", weekStart: startOfWeek(NOW), weightKg: 89.4, sleepAvgHours: 5.8, energy: 2, stress: 4, trainingCompleted: 4, nutritionAdherence: 2, wins: "3 séances malgré la semaine chargée", struggles: "réveils nocturnes", frictionTags: ["RECOVERY"] };
  it("produces arrows, main issue and coaching focus", () => {
    const s = summarizeCheckIn(cur, prev, baseSnapshot().goals[0]);
    expect(s.progress).toBe("UP");
    expect(s.training).toBe("FLAT");
    expect(s.nutrition).toBe("DOWN");
    expect(s.recovery).toBe("DOWN");
    expect(s.mainIssue).toBe("Sommeil");
    expect(s.coachingFocus).toContain("Récupération");
    expect(s.highlights.some((h) => h.includes("-0.6"))).toBe(true);
    expect(s.concerns.some((c) => c.includes("réveils"))).toBe(true);
  });
  it("works without a previous check-in", () => {
    const s = summarizeCheckIn(cur, null, null);
    expect(s.progress).toBe("FLAT");
    expect(s.mainIssue).toBeTruthy();
  });
});

describe("weekly review", () => {
  it("builds a complete card", () => {
    const snap = baseSnapshot({
      sessions: buildSessions({ weeks: 4, perWeek: 4, completion: [1, 1, 1, 0.5], seed: 11 }),
      measurements: buildWeights({ start: 90, perWeek: -0.5, days: 28, noise: 0.1 }),
      sets: buildSets({ exerciseId: "sq", name: "Squat", loads: [80, 82.5, 85, 90] }),
    });
    const r = buildWeeklyReview(snap);
    expect(["WATCH", "NEEDS_ATTENTION", "ON_TRACK"]).toContain(r.status);
    expect(r.whatChanged.length).toBeGreaterThan(0);
    expect(r.metrics.sessionsPlanned).toBeGreaterThan(0);
    expect(r.metrics.weightDeltaKg).not.toBeNull();
  });
  it("marks recently onboarded clients as NEW", () => {
    expect(buildWeeklyReview(baseSnapshot({ client: { ...baseSnapshot().client, onboardedAt: addDays(NOW, -5) } })).status).toBe("NEW");
  });
});

describe("program rules", () => {
  it("double progression increases load when the top of the range is reached", () => {
    const s = suggestProgression({ rule: "DOUBLE_PROGRESSION", repsMin: 8, repsMax: 12, currentLoadKg: 60, incrementKg: 2.5, lastSets: [{ reps: 12, weightKg: 60, rpe: 8 }, { reps: 12, weightKg: 60, rpe: 8.5 }, { reps: 12, weightKg: 60, rpe: 9 }] });
    expect(s.change).toBe("UP");
    expect(s.nextLoadKg).toBe(62.5);
    const keep = suggestProgression({ rule: "DOUBLE_PROGRESSION", repsMin: 8, repsMax: 12, currentLoadKg: 60, lastSets: [{ reps: 12, weightKg: 60, rpe: 8 }, { reps: 10, weightKg: 60, rpe: 9 }] });
    expect(keep.change).toBe("KEEP");
    const down = suggestProgression({ rule: "DOUBLE_PROGRESSION", repsMin: 8, repsMax: 12, currentLoadKg: 60, lastSets: [{ reps: 6, weightKg: 60, rpe: 10 }] });
    expect(down.change).toBe("DOWN");
    expect(down.nextLoadKg).toBe(57);
  });
  it("RPE-based moves load by the RPE gap and MANUAL never suggests", () => {
    expect(suggestProgression({ rule: "RPE_BASED", targetRpe: 8, repsMin: 5, repsMax: 5, currentLoadKg: 100, lastSets: [{ reps: 5, weightKg: 100, rpe: 6.5 }] }).change).toBe("UP");
    expect(suggestProgression({ rule: "RPE_BASED", targetRpe: 8, repsMin: 5, repsMax: 5, currentLoadKg: 100, lastSets: [{ reps: 5, weightKg: 100, rpe: 9.5 }] }).change).toBe("DOWN");
    expect(suggestProgression({ rule: "MANUAL", repsMin: 5, repsMax: 5, currentLoadKg: 100, lastSets: [] }).change).toBe("MANUAL");
  });
  it("offers move / compress / coach review for missed sessions", () => {
    const sessions = buildSessions({ weeks: 1, perWeek: 3, completion: 0 });
    const missed = sessions.find((s) => s.status === "MISSED")!;
    const opts = missedSessionOptions({ missed, weekSessions: sessions, now: NOW, missedThisWeek: 1 });
    expect(opts.map((o) => o.kind)).toEqual(expect.arrayContaining(["COMPRESS", "SKIP"]));
    expect(opts.some((o) => o.recommended)).toBe(true);
    const many = missedSessionOptions({ missed, weekSessions: sessions, now: NOW, missedThisWeek: 3 });
    expect(many.find((o) => o.kind === "COACH_REVIEW")?.recommended).toBe(true);
  });
  it("suggests a deload on cycle, low recovery or high RPE", () => {
    // 30 days in → week 5 → deload week when the cycle is every 5 weeks
    const base = { programStart: addDays(NOW, -30), now: NOW, deloadEveryWeeks: 5, dailyLogs: [], recentSessions: [] };
    expect(deloadSuggestion(base).recommended).toBe(true);
    expect(deloadSuggestion({ ...base, deloadEveryWeeks: null }).recommended).toBe(false);
    expect(deloadSuggestion({ ...base, deloadEveryWeeks: null, dailyLogs: buildDailyLogs({ days: 7, sleep: 7, energy: 2, recovery: 2 }) }).recommended).toBe(true);
    expect(deloadSuggestion({ ...base, deloadEveryWeeks: null, recentSessions: buildSessions({ weeks: 2, perWeek: 3, completion: 1, rpe: 9 }) }).recommended).toBe(true);
  });
});

describe("communication composer", () => {
  it("composes in three languages and five tones", () => {
    const fr = composeMessage({ situation: "MISSED_WORKOUTS", tone: "FRIENDLY", locale: "fr", clientFirstName: "Ahmed", coachName: "Coach Sami", facts: { missedCount: 2 } });
    expect(fr).toContain("Salut Ahmed");
    expect(fr).toContain("2 séances");
    const ar = composeMessage({ situation: "CHECKIN_REMINDER", tone: "DIRECT", locale: "ar", clientFirstName: "أحمد", coachName: "سامي" });
    expect(ar).toContain("أحمد");
    const en = composeMessage({ situation: "CELEBRATE", tone: "CONCISE", locale: "en", clientFirstName: "Ahmed", coachName: "Sami", facts: { milestone: "Squat 100 kg" } });
    expect(en).toContain("Squat 100 kg");
    expect(en.endsWith("Sami")).toBe(false); // concise has no closer
  });
});
