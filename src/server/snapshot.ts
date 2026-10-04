/**
 * Builds the `ClientSnapshot` consumed by every intelligence engine from the
 * database, with bounded windows so the queries stay cheap.
 */

import { db } from "@/server/db";
import { addDays } from "@/domain/stats";
import type { ClientSnapshot, ClientStatus, FrictionCategory, GoalType, Locale, SessionStatus } from "@/domain/types";
import { isLocale } from "@/lib/i18n/dictionary";

export async function buildSnapshot(clientId: string, now = new Date()): Promise<ClientSnapshot | null> {
  const from56 = addDays(now, -56);
  const from90 = addDays(now, -90);
  const from28 = addDays(now, -28);
  const from30 = addDays(now, -30);
  const to7 = addDays(now, 8);

  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      goals: true,
      programs: { where: { status: "ACTIVE" }, take: 1, orderBy: { startDate: "desc" } },
      workoutSessions: {
        where: { scheduledFor: { gte: from56, lt: to7 } },
        include: { workout: { select: { name: true } }, sets: { include: { exercise: { select: { id: true, name: true, isMainLift: true } } } } },
        orderBy: { scheduledFor: "asc" },
      },
      measurements: { where: { date: { gte: from90 } }, orderBy: { date: "asc" } },
      dailyLogs: { where: { date: { gte: from28 } }, orderBy: { date: "asc" } },
      habits: { where: { active: true }, include: { logs: { where: { date: { gte: from28 } } } } },
      checkIns: { orderBy: { weekStart: "asc" }, take: 8 },
      messages: { where: { createdAt: { gte: from30 } }, select: { direction: true, createdAt: true, readAt: true } },
      payments: { where: { paidAt: null } },
      subscriptions: { orderBy: { startDate: "desc" }, take: 1 },
      milestones: { orderBy: { reachedAt: "desc" }, take: 10 },
    },
  });
  if (!client) return null;

  const program = client.programs[0] ?? null;
  const sets: ClientSnapshot["sets"] = [];
  for (const s of client.workoutSessions) {
    if (s.status !== "COMPLETED") continue;
    for (const st of s.sets) {
      sets.push({ date: s.completedAt ?? s.scheduledFor, exerciseId: st.exercise.id, exerciseName: st.exercise.name, isMainLift: st.exercise.isMainLift, reps: st.reps, weightKg: st.weightKg, rpe: st.rpe });
    }
  }
  const sub = client.subscriptions[0] ?? null;

  return {
    now,
    client: {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      status: client.status as ClientStatus,
      onboardedAt: client.onboardedAt,
      checkInWeekday: client.checkInWeekday,
      plannedSessionsPerWeek: client.plannedSessionsPerWeek,
      lastActiveAt: client.lastActiveAt,
      preferredLocale: (isLocale(client.preferredLocale) ? client.preferredLocale : "fr") as Locale,
    },
    goals: client.goals.map((g) => ({ id: g.id, type: g.type as GoalType, title: g.title, metric: g.metric, startValue: g.startValue, targetValue: g.targetValue, targetDate: g.targetDate, isPrimary: g.isPrimary, status: g.status })),
    program: program ? { id: program.id, name: program.name, status: program.status, startDate: program.startDate, sessionsPerWeek: program.sessionsPerWeek, progressionRule: program.progressionRule, deloadEveryWeeks: program.deloadEveryWeeks } : null,
    sessions: client.workoutSessions.map((s) => ({
      id: s.id,
      scheduledFor: s.scheduledFor,
      status: s.status as SessionStatus,
      completedAt: s.completedAt,
      durationMin: s.durationMin,
      sessionRpe: s.sessionRpe,
      isShortened: s.isShortened,
      missedReason: (s.missedReason as FrictionCategory | null) ?? null,
      workoutName: s.workout?.name ?? null,
    })),
    sets,
    measurements: client.measurements.map((m) => ({ date: m.date, weightKg: m.weightKg, waistCm: m.waistCm, bodyFatPct: m.bodyFatPct })),
    dailyLogs: client.dailyLogs.map((l) => ({ date: l.date, sleepHours: l.sleepHours, sleepQuality: l.sleepQuality, energy: l.energy, soreness: l.soreness, stress: l.stress, perceivedRecovery: l.perceivedRecovery, nutritionAdherence: l.nutritionAdherence })),
    habits: client.habits.map((h) => ({ id: h.id, name: h.name, kind: h.kind, daysPerWeek: h.daysPerWeek, logs: h.logs.map((l) => ({ date: l.date, done: l.done, value: l.value })) })),
    checkIns: client.checkIns.map((c) => ({
      id: c.id,
      weekStart: c.weekStart,
      status: c.status,
      submittedAt: c.submittedAt,
      weightKg: c.weightKg,
      sleepAvgHours: c.sleepAvgHours,
      energy: c.energy,
      soreness: c.soreness,
      stress: c.stress,
      trainingCompleted: c.trainingCompleted,
      trainingPlanned: c.trainingPlanned,
      nutritionAdherence: c.nutritionAdherence,
      habitAdherencePct: c.habitAdherencePct,
      wins: c.wins,
      struggles: c.struggles,
      frictionTags: c.frictionTags ? (c.frictionTags.split(",").filter(Boolean) as FrictionCategory[]) : [],
      freeText: c.freeText,
      coachReviewedAt: c.coachReviewedAt,
    })),
    messages: client.messages.map((m) => ({ direction: m.direction as "COACH_TO_CLIENT" | "CLIENT_TO_COACH", createdAt: m.createdAt, readAt: m.readAt })),
    payments: client.payments.map((p) => ({ id: p.id, dueAt: p.dueAt, paidAt: p.paidAt, status: p.status, amount: p.amount })),
    subscription: sub ? { status: sub.status, endDate: sub.endDate, packageName: sub.packageName } : null,
    milestones: client.milestones.map((m) => ({ kind: m.kind, title: m.title, reachedAt: m.reachedAt })),
  };
}
