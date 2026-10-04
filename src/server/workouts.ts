/**
 * Shared workout-session logic used by both the client app and the coach's
 * workout mode: build the data for WorkoutMode, and persist a completed session
 * (sets, PR detection, milestones, events, recompute).
 */

import { db, parseJson } from "@/server/db";
import { recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import { suggestProgression } from "@/domain/program";
import { e1rm } from "@/domain/stats";
import type { Locale } from "@/domain/types";
import type { WorkoutModeExercise } from "@/components/workout-mode";

const num = (v: FormDataEntryValue | null) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function loadWorkoutModeData(sessionId: string, clientId: string, locale: Locale) {
  const session = await db.workoutSession.findFirst({
    where: { id: sessionId, clientId },
    include: { workout: { include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } } }, program: true, client: { select: { firstName: true, lastName: true } } },
  });
  if (!session || !session.workout) return null;
  const last = await db.workoutSession.findFirst({ where: { clientId, workoutId: session.workoutId, status: "COMPLETED", id: { not: session.id } }, orderBy: { completedAt: "desc" }, include: { sets: true } });
  const params = parseJson<{ incrementKg?: number; targetRpe?: number }>(session.program?.progressionJson ?? "{}", {});
  const rule = session.program?.progressionRule ?? "DOUBLE_PROGRESSION";
  const pinned = await db.coachNote.findMany({ where: { clientId, pinned: true, category: { in: ["INJURY", "EQUIPMENT"] } }, take: 3 });
  const exercises: WorkoutModeExercise[] = session.workout.exercises.map((we) => {
    const lastSets = last?.sets.filter((s) => s.exerciseId === we.exerciseId).sort((a, b) => a.setIndex - b.setIndex) ?? [];
    const sug = suggestProgression({ rule, repsMin: we.repsMin, repsMax: we.repsMax, targetRpe: we.targetRpe ?? params.targetRpe, incrementKg: params.incrementKg ?? 2.5, currentLoadKg: we.startLoadKg, lastSets: lastSets.map((s) => ({ reps: s.reps, weightKg: s.weightKg, rpe: s.rpe })) }, locale);
    return {
      weId: we.id,
      name: we.exercise.name,
      isMainLift: we.exercise.isMainLift,
      muscleGroup: we.exercise.muscleGroup,
      sets: we.sets,
      repsMin: we.repsMin,
      repsMax: we.repsMax,
      targetRpe: we.targetRpe,
      restSec: we.restSec,
      prefillKg: sug.nextLoadKg ?? we.startLoadKg ?? 0,
      suggestion: sug.change !== "KEEP" && sug.change !== "MANUAL" && lastSets.length ? sug.explanation : null,
      last: lastSets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
    };
  });
  return {
    session,
    personName: `${session.client.firstName} ${session.client.lastName}`,
    workoutName: session.workout.name,
    focus: session.workout.focus,
    minutes: session.workout.estimatedMinutes,
    isShortened: session.isShortened,
    warnings: pinned.map((n) => n.content),
    exercises,
  };
}

export async function completeWorkoutCore(input: { sessionId: string; clientId: string; orgId: string; actorId: string; locale: Locale; formData: FormData; byCoach: boolean }) {
  const { sessionId, clientId, orgId, actorId, locale, formData } = input;
  const session = await db.workoutSession.findFirst({ where: { id: sessionId, clientId }, include: { workout: { include: { exercises: { include: { exercise: true } } } }, client: { select: { coachId: true } } } });
  if (!session || !session.workout) return null;
  if (session.status === "COMPLETED") return { workoutName: session.workout.name, prs: [] as string[], alreadyDone: true };

  const sessionRpe = num(formData.get("sessionRpe"));
  const isShortened = !!formData.get("isShortened");
  const clientNote = String(formData.get("clientNote") ?? "").slice(0, 500) || null;
  const durationMin = num(formData.get("durationMin"));

  const rows: { exerciseId: string; setIndex: number; reps: number; weightKg: number; rpe: number | null }[] = [];
  for (const we of session.workout.exercises) {
    for (let i = 0; i < we.sets; i++) {
      const reps = num(formData.get(`set:${we.id}:${i}:reps`));
      const kg = num(formData.get(`set:${we.id}:${i}:kg`));
      if (reps === null || reps <= 0) continue;
      rows.push({ exerciseId: we.exerciseId, setIndex: i, reps: Math.round(reps), weightKg: kg ?? 0, rpe: null });
    }
  }

  const history = await db.exerciseSet.findMany({ where: { session: { clientId, status: "COMPLETED" }, exercise: { isMainLift: true } }, select: { exerciseId: true, reps: true, weightKg: true } });
  const best = new Map<string, number>();
  for (const h of history) best.set(h.exerciseId, Math.max(best.get(h.exerciseId) ?? 0, e1rm(h.weightKg, h.reps)));

  const created = await db.$transaction(async (tx) => {
    const out: { id: string; exerciseId: string; v: number; reps: number; weightKg: number }[] = [];
    for (const r of rows) {
      const row = await tx.exerciseSet.create({ data: { sessionId: session.id, ...r } });
      out.push({ id: row.id, exerciseId: r.exerciseId, v: e1rm(r.weightKg, r.reps), reps: r.reps, weightKg: r.weightKg });
    }
    return out;
  });

  const prs: string[] = [];
  for (const we of session.workout.exercises) {
    if (!we.exercise.isMainLift) continue;
    const mine = created.filter((s) => s.exerciseId === we.exerciseId);
    if (!mine.length) continue;
    const top = mine.reduce((a, b) => (b.v > a.v ? b : a));
    if (history.length && top.v > 0 && top.v > (best.get(we.exerciseId) ?? 0)) {
      await db.exerciseSet.update({ where: { id: top.id }, data: { isPr: true } });
      prs.push(`${we.exercise.name} ${top.weightKg} kg × ${top.reps}`);
    }
  }

  await db.workoutSession.update({
    where: { id: session.id },
    data: { status: "COMPLETED", startedAt: session.startedAt ?? new Date(), completedAt: new Date(), sessionRpe, isShortened, clientNote: input.byCoach ? session.clientNote : clientNote, coachNote: input.byCoach ? clientNote : session.coachNote, durationMin },
  });
  await db.client.update({ where: { id: clientId }, data: { lastActiveAt: new Date() } });
  await recordEvent({ orgId, clientId, type: "workout.completed", actorId, payload: { workout: session.workout.name, rpe: sessionRpe, sets: rows.length, by: input.byCoach ? "coach" : "client" } });
  for (const title of prs) {
    await db.milestone.create({ data: { clientId, kind: "PR", title } });
    await recordEvent({ orgId, clientId, type: "milestone.reached", actorId, payload: { title } });
  }
  await recomputeClient(clientId, session.client.coachId, locale);
  return { workoutName: session.workout.name, prs, alreadyDone: false };
}
