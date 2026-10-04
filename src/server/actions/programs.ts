"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { assertClientInOrg, requirePermission, requireStaff } from "@/server/auth/session";
import { recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import { completeWorkoutCore } from "@/server/workouts";
import { PROGRAM_TEMPLATES, WEEKDAY_PLANS, roundLoad } from "@/domain/templates";
import { addDays, startOfDay, startOfWeek } from "@/domain/stats";
import { FRICTION_CATEGORIES } from "@/domain/types";

const CreateProgram = z.object({ clientId: z.string(), template: z.string(), name: z.string().trim().max(120).optional().or(z.literal("")), activate: z.string().optional() });

export async function createProgramFromTemplateAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const p = CreateProgram.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  const tpl = PROGRAM_TEMPLATES.find((t) => t.key === p.template);
  if (!tpl) return;
  const client = await db.client.findUnique({ where: { id: p.clientId }, include: { measurements: { orderBy: { date: "desc" }, take: 1 }, goals: { where: { isPrimary: true }, take: 1 } } });
  if (!client) return;
  const bw = client.measurements[0]?.weightKg ?? client.goals[0]?.startValue ?? 75;
  const exercises = await db.exercise.findMany({ where: { OR: [{ orgId: null }, { orgId: user.orgId }] } });
  const byName = new Map(exercises.map((e) => [e.name, e]));
  const activate = !!p.activate;
  if (activate) await db.program.updateMany({ where: { clientId: p.clientId, status: "ACTIVE" }, data: { status: "ARCHIVED", endDate: new Date() } });

  const program = await db.program.create({
    data: {
      clientId: p.clientId,
      coachId: user.id,
      name: p.name || `${tpl.name} — ${client.firstName}`,
      status: activate ? "ACTIVE" : "DRAFT",
      sessionsPerWeek: tpl.sessionsPerWeek,
      progressionRule: tpl.progressionRule,
      progressionJson: JSON.stringify({ incrementKg: 2.5, targetRpe: 8 }),
      deloadEveryWeeks: tpl.deloadEveryWeeks,
      workouts: {
        create: tpl.workouts.map((w, i) => ({
          name: w.name,
          order: i,
          focus: w.focus,
          estimatedMinutes: w.estimatedMinutes,
          exercises: {
            create: w.exercises
              .filter((e) => byName.has(e.exercise))
              .map((e, j) => ({ exerciseId: byName.get(e.exercise)!.id, order: j, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, restSec: e.restSec, startLoadKg: e.bwFactor ? roundLoad(bw * e.bwFactor * (client.sex === "F" ? 0.65 : 1), 2.5) : null, targetRpe: tpl.progressionRule === "RPE_BASED" ? 8 : null })),
          },
        })),
      },
    },
  });
  await db.client.update({ where: { id: p.clientId }, data: { plannedSessionsPerWeek: tpl.sessionsPerWeek, status: client.status === "ONBOARDING" && activate ? "ACTIVE" : client.status } });
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "program.created", actorId: user.id, payload: { name: program.name } });
  if (activate) {
    await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "program.activated", actorId: user.id, payload: { name: program.name } });
    await scheduleWeeks(program.id, p.clientId, tpl.sessionsPerWeek, 2);
  }
  await recomputeClient(p.clientId, client.coachId, user.locale);
  revalidatePath(`/clients/${p.clientId}`);
  redirect(`/clients/${p.clientId}?tab=training`);
}

export async function activateProgramAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const programId = String(formData.get("programId"));
  const program = await db.program.findFirst({ where: { id: programId, client: { orgId: user.orgId } }, include: { client: true } });
  if (!program) return;
  await db.program.updateMany({ where: { clientId: program.clientId, status: "ACTIVE", id: { not: programId } }, data: { status: "ARCHIVED", endDate: new Date() } });
  await db.program.update({ where: { id: programId }, data: { status: "ACTIVE", startDate: new Date() } });
  if (program.client.status === "ONBOARDING") await db.client.update({ where: { id: program.clientId }, data: { status: "ACTIVE" } });
  await recordEvent({ orgId: user.orgId, clientId: program.clientId, type: "program.activated", actorId: user.id, payload: { name: program.name } });
  await scheduleWeeks(programId, program.clientId, program.sessionsPerWeek, 2);
  await recomputeClient(program.clientId, program.client.coachId, user.locale);
  revalidatePath(`/clients/${program.clientId}`);
  redirect(`/clients/${program.clientId}?tab=training`);
}

/** Creates SCHEDULED sessions for the next `weeks` weeks where none exist. */
async function scheduleWeeks(programId: string, clientId: string, perWeek: number, weeks: number) {
  const workouts = await db.workout.findMany({ where: { programId }, orderBy: { order: "asc" } });
  if (!workouts.length) return;
  const days = WEEKDAY_PLANS[Math.min(7, Math.max(1, perWeek))];
  const now = new Date();
  const week0 = startOfWeek(now);
  let k = 0;
  for (let w = 0; w < weeks; w++) {
    for (const d of days) {
      const date = addDays(week0, w * 7 + d);
      date.setHours(18, 0, 0, 0);
      if (date < startOfDay(now)) continue;
      const exists = await db.workoutSession.findFirst({ where: { clientId, scheduledFor: { gte: startOfDay(date), lt: addDays(startOfDay(date), 1) } } });
      if (exists) {
        k++;
        continue;
      }
      await db.workoutSession.create({ data: { clientId, programId, workoutId: workouts[k % workouts.length].id, scheduledFor: date, status: "SCHEDULED" } });
      k++;
    }
  }
}

export async function scheduleWeekAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const programId = String(formData.get("programId"));
  const program = await db.program.findFirst({ where: { id: programId, client: { orgId: user.orgId } } });
  if (!program) return;
  await scheduleWeeks(programId, program.clientId, program.sessionsPerWeek, 2);
  revalidatePath(`/clients/${program.clientId}`);
  revalidatePath("/agenda");
}

const UpdateLoad = z.object({ workoutExerciseId: z.string(), startLoadKg: z.coerce.number().min(0).max(500) });

export async function updateExerciseLoadAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const p = UpdateLoad.parse({ workoutExerciseId: formData.get("workoutExerciseId"), startLoadKg: formData.get("startLoadKg") });
  const we = await db.workoutExercise.findFirst({ where: { id: p.workoutExerciseId, workout: { program: { client: { orgId: user.orgId } } } }, include: { workout: { include: { program: true } } } });
  if (!we) return;
  await db.workoutExercise.update({ where: { id: we.id }, data: { startLoadKg: p.startLoadKg } });
  await recordEvent({ orgId: user.orgId, clientId: we.workout.program.clientId, type: "program.updated", actorId: user.id, payload: { workoutExerciseId: we.id, startLoadKg: p.startLoadKg } });
  revalidatePath(`/clients/${we.workout.program.clientId}`);
}

const SubstituteExercise = z.object({ workoutExerciseId: z.string(), exerciseId: z.string() });

export async function substituteExerciseAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const p = SubstituteExercise.parse({ workoutExerciseId: formData.get("workoutExerciseId"), exerciseId: formData.get("exerciseId") });
  const we = await db.workoutExercise.findFirst({ where: { id: p.workoutExerciseId, workout: { program: { client: { orgId: user.orgId } } } }, include: { workout: { include: { program: true } }, exercise: true } });
  if (!we) return;
  const target = await db.exercise.findFirst({ where: { id: p.exerciseId, OR: [{ orgId: null }, { orgId: user.orgId }] } });
  if (!target) return;
  await db.workoutExercise.update({ where: { id: we.id }, data: { exerciseId: target.id } });
  await recordEvent({ orgId: user.orgId, clientId: we.workout.program.clientId, type: "program.updated", actorId: user.id, payload: { from: we.exercise.name, to: target.name } });
  revalidatePath(`/clients/${we.workout.program.clientId}`);
}

// ───────────────────────────── sessions (coach side) ────────────────────────

/** Coach logs a client's session from Workout Mode (same core as the client app). */
export async function coachCompleteWorkoutAction(formData: FormData) {
  const user = await requireStaff();
  const sessionId = String(formData.get("sessionId") ?? "");
  const s = await db.workoutSession.findFirst({ where: { id: sessionId, client: { orgId: user.orgId } }, select: { clientId: true } });
  if (!s) return;
  const r = await completeWorkoutCore({ sessionId, clientId: s.clientId, orgId: user.orgId, actorId: user.id, locale: user.locale, formData, byCoach: true });
  revalidatePath(`/clients/${s.clientId}`);
  revalidatePath("/agenda");
  revalidatePath("/");
  redirect(`/clients/${s.clientId}?tab=training${r && !r.alreadyDone ? `&done=${encodeURIComponent(r.workoutName)}${r.prs.length ? `&pr=${encodeURIComponent(r.prs[0])}` : ""}` : ""}`);
}

const SessionStatusInput = z.object({ sessionId: z.string(), status: z.enum(["COMPLETED", "MISSED", "SKIPPED", "SCHEDULED"]), missedReason: z.enum(FRICTION_CATEGORIES as [string, ...string[]]).optional().or(z.literal("")), coachNote: z.string().max(500).optional().or(z.literal("")) });

export async function setSessionStatusAction(formData: FormData) {
  const user = await requireStaff();
  const p = SessionStatusInput.parse({ sessionId: formData.get("sessionId"), status: formData.get("status"), missedReason: formData.get("missedReason") ?? undefined, coachNote: formData.get("coachNote") ?? undefined });
  const s = await db.workoutSession.findFirst({ where: { id: p.sessionId, client: { orgId: user.orgId } }, include: { client: { select: { coachId: true } } } });
  if (!s) return;
  await db.workoutSession.update({
    where: { id: s.id },
    data: { status: p.status, missedReason: p.status === "MISSED" ? p.missedReason || null : null, completedAt: p.status === "COMPLETED" ? (s.completedAt ?? new Date()) : null, coachNote: p.coachNote || s.coachNote },
  });
  if (p.status === "COMPLETED") await recordEvent({ orgId: user.orgId, clientId: s.clientId, type: "workout.completed", actorId: user.id, payload: { sessionId: s.id, by: "coach" } });
  if (p.status === "MISSED") await recordEvent({ orgId: user.orgId, clientId: s.clientId, type: "workout.missed", actorId: user.id, payload: { sessionId: s.id, reason: p.missedReason || null } });
  await recomputeClient(s.clientId, s.client.coachId, user.locale);
  revalidatePath(`/clients/${s.clientId}`);
  revalidatePath("/agenda");
  revalidatePath("/");
}

const Reschedule = z.object({ sessionId: z.string(), date: z.string().min(8) });

export async function rescheduleSessionAction(formData: FormData) {
  const user = await requireStaff();
  const p = Reschedule.parse({ sessionId: formData.get("sessionId"), date: formData.get("date") });
  const s = await db.workoutSession.findFirst({ where: { id: p.sessionId, client: { orgId: user.orgId } } });
  if (!s) return;
  const date = new Date(p.date);
  date.setHours(18, 0, 0, 0);
  await db.workoutSession.update({ where: { id: s.id }, data: { status: "RESCHEDULED" } });
  await db.workoutSession.create({ data: { clientId: s.clientId, programId: s.programId, workoutId: s.workoutId, scheduledFor: date, status: "SCHEDULED" } });
  revalidatePath(`/clients/${s.clientId}`);
  revalidatePath("/agenda");
}
