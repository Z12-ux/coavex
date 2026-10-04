/**
 * Loader for the client profile (single source of truth screen).
 */

import { db, parseJson } from "@/server/db";
import { buildSnapshot } from "@/server/snapshot";
import { computeMomentum } from "@/domain/momentum";
import { detectDrift } from "@/domain/drift";
import { computeFriction } from "@/domain/friction";
import { deloadSuggestion, missedSessionOptions, suggestProgression, type ProgressionSuggestion } from "@/domain/program";
import { addDays, bestE1rmByExercise, effectiveStatus, sessionsBetween, startOfWeek, weeklyCompletion } from "@/domain/stats";
import type { CheckInSummary, ClientSnapshot, Evidence, FrictionCategory, Locale, MissedSessionOption, Severity } from "@/domain/types";

export async function loadClientProfile(id: string, orgId: string, locale: Locale) {
  const now = new Date();
  const client = await db.client.findFirst({
    where: { id, orgId },
    include: {
      coach: { select: { id: true, name: true } },
      user: { select: { email: true, lastActiveAt: true } },
      goals: { orderBy: { isPrimary: "desc" } },
      assessments: { orderBy: { date: "desc" }, take: 1 },
      notes: { include: { author: { select: { name: true } } }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
      programs: { include: { workouts: { include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } }, orderBy: { order: "asc" } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
      measurements: { orderBy: { date: "asc" } },
      progressPhotos: { orderBy: { date: "asc" } },
      habits: { include: { logs: { where: { date: { gte: addDays(now, -28) } }, orderBy: { date: "asc" } } }, orderBy: { createdAt: "asc" } },
      nutritionPlans: { where: { active: true }, take: 1 },
      dailyLogs: { where: { date: { gte: addDays(now, -28) } }, orderBy: { date: "desc" } },
      checkIns: { orderBy: { weekStart: "desc" }, take: 12 },
      subscriptions: { orderBy: { startDate: "desc" } },
      payments: { orderBy: { dueAt: "desc" }, take: 24 },
      milestones: { orderBy: { reachedAt: "desc" } },
      signals: { where: { resolvedAt: null, dismissedAt: null }, orderBy: { detectedAt: "desc" } },
      actions: { where: { status: "OPEN" }, orderBy: { priority: "desc" } },
      events: { orderBy: { occurredAt: "desc" }, take: 80 },
      workoutSessions: {
        where: { scheduledFor: { gte: addDays(now, -56), lt: addDays(now, 14) } },
        include: { workout: { select: { id: true, name: true } }, sets: { include: { exercise: { select: { id: true, name: true, isMainLift: true } } }, orderBy: { setIndex: "asc" } } },
        orderBy: { scheduledFor: "desc" },
      },
    },
  });
  if (!client) return null;
  const snap = await buildSnapshot(id, now);
  if (!snap) return null;

  const momentum = computeMomentum(snap, locale);
  const drift = detectDrift(snap, locale);
  const friction = computeFriction(snap, locale);
  const activeProgram = client.programs.find((p) => p.status === "ACTIVE") ?? null;
  const deload = activeProgram ? deloadSuggestion({ programStart: activeProgram.startDate, now, deloadEveryWeeks: activeProgram.deloadEveryWeeks, dailyLogs: snap.dailyLogs, recentSessions: snap.sessions }, locale) : null;

  // progression suggestion per workout exercise (last completed session of that workout)
  const suggestions = new Map<string, ProgressionSuggestion>();
  if (activeProgram) {
    const rule = activeProgram.progressionRule;
    const params = parseJson<{ incrementKg?: number; targetRpe?: number }>(activeProgram.progressionJson, {});
    for (const w of activeProgram.workouts) {
      const lastSession = client.workoutSessions.find((s) => s.workoutId === w.id && s.status === "COMPLETED");
      for (const we of w.exercises) {
        const lastSets = lastSession ? lastSession.sets.filter((s) => s.exerciseId === we.exerciseId).map((s) => ({ reps: s.reps, weightKg: s.weightKg, rpe: s.rpe })) : [];
        suggestions.set(we.id, suggestProgression({ rule, repsMin: we.repsMin, repsMax: we.repsMax, targetRpe: we.targetRpe ?? params.targetRpe, incrementKg: params.incrementKg ?? 2.5, currentLoadKg: we.startLoadKg, lastSets }, locale));
      }
    }
  }

  // library substitutes of the active program's exercises (swap control on the training tab), keyed by exercise id
  const substitutes = new Map<string, { id: string; name: string; muscleGroup: string }[]>();
  if (activeProgram) {
    const idsOf = (s: string) => s.split(",").filter(Boolean);
    const wanted = new Set(activeProgram.workouts.flatMap((w) => w.exercises.flatMap((we) => idsOf(we.exercise.substitutes))));
    const rows = wanted.size ? await db.exercise.findMany({ where: { id: { in: [...wanted] }, OR: [{ orgId: null }, { orgId }] }, select: { id: true, name: true, muscleGroup: true } }) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const w of activeProgram.workouts) {
      for (const we of w.exercises) substitutes.set(we.exercise.id, idsOf(we.exercise.substitutes).flatMap((sid) => byId.get(sid) ?? []));
    }
  }

  // missed sessions this week → options
  const weekStart = startOfWeek(now);
  const weekSessions = snap.sessions.filter((s) => s.scheduledFor >= weekStart && s.scheduledFor < addDays(weekStart, 7));
  const missedThisWeek = weekSessions.filter((s) => effectiveStatus(s, now) === "MISSED");
  const missedOptions = new Map<string, MissedSessionOption[]>();
  for (const m of missedThisWeek) missedOptions.set(m.id, missedSessionOptions({ missed: m, weekSessions, now, missedThisWeek: missedThisWeek.length }, locale));

  // PRs
  const bests = bestE1rmByExercise(snap.sets, addDays(now, -365), addDays(now, 1));
  const prs = [...bests.entries()].map(([exerciseId, b]) => ({ exerciseId, ...b })).sort((a, b) => b.e1rm - a.e1rm);

  const weekly = weeklyCompletion(snap.sessions, now, 8);
  const last28 = sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, 1));

  return {
    client,
    snap,
    momentum,
    drift,
    friction,
    activeProgram,
    deload,
    suggestions,
    substitutes,
    missedOptions,
    prs,
    weekly,
    last28,
    signals: client.signals.map((s) => ({ id: s.id, key: s.key, severity: s.severity as Severity, polarity: s.polarity, title: s.title, what: s.what, why: s.why, evidence: parseJson<Evidence[]>(s.evidenceJson, []), suggestedAction: s.suggestedAction, detectedAt: s.detectedAt })),
    actions: client.actions.map((a) => ({ id: a.id, kind: a.kind, title: a.title, reason: a.reason, priority: a.priority, dueAt: a.dueAt, status: a.status })),
    checkIns: client.checkIns.map((c) => ({ ...c, summary: parseJson<CheckInSummary | null>(c.summaryJson, null), tags: (c.frictionTags ? c.frictionTags.split(",").filter(Boolean) : []) as FrictionCategory[] })),
  };
}

export type ClientProfile = NonNullable<Awaited<ReturnType<typeof loadClientProfile>>>;
export type { ClientSnapshot };
