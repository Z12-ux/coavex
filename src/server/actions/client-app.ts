"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { requireClientSelf } from "@/server/auth/session";
import { recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import { summarizeCheckIn } from "@/domain/checkin";
import { completeWorkoutCore } from "@/server/workouts";
import { checkImageDataUrl, PHOTO_POSES, storeImage } from "@/server/storage";
import { addDays, startOfDay, startOfWeek } from "@/domain/stats";
import { FRICTION_CATEGORIES, type FrictionCategory, type GoalType } from "@/domain/types";
import { isLocale } from "@/lib/i18n/dictionary";

const num = (v: FormDataEntryValue | null) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ───────────────────────────── progress photos ──────────────────────────────

const MyPhoto = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pose: z.enum(PHOTO_POSES),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  dataUrl: z.string().min(40),
});

export async function addMyPhotoAction(formData: FormData) {
  const me = await requireClientSelf();
  const p = MyPhoto.parse(Object.fromEntries(formData.entries()));
  const img = checkImageDataUrl(p.dataUrl);
  if (!img.ok) throw new Error(img.error);
  const url = await storeImage(img);
  await db.progressPhoto.create({ data: { clientId: me.clientId, date: new Date(p.date), url, pose: p.pose, note: p.note || null } });
  await db.client.update({ where: { id: me.clientId }, data: { lastActiveAt: new Date() } });
  await recordEvent({ orgId: me.orgId, clientId: me.clientId, type: "photo.added", actorId: me.id, occurredAt: new Date(p.date), payload: { pose: p.pose, by: "CLIENT" } });
  revalidatePath("/app/progress");
}

export async function deleteMyPhotoAction(formData: FormData) {
  const me = await requireClientSelf();
  const id = String(formData.get("photoId") ?? "");
  const ph = await db.progressPhoto.findFirst({ where: { id, clientId: me.clientId }, select: { id: true } });
  if (!ph) return;
  await db.progressPhoto.delete({ where: { id: ph.id } });
  revalidatePath("/app/progress");
}

// ───────────────────────────── daily log ────────────────────────────────────

export async function logDailyAction(formData: FormData) {
  const me = await requireClientSelf();
  const date = startOfDay(new Date());
  const data = {
    sleepHours: num(formData.get("sleepHours")),
    energy: num(formData.get("energy")),
    soreness: num(formData.get("soreness")),
    stress: num(formData.get("stress")),
    perceivedRecovery: num(formData.get("perceivedRecovery")),
    nutritionAdherence: num(formData.get("nutritionAdherence")),
    note: String(formData.get("note") ?? "").slice(0, 300) || null,
  };
  await db.dailyLog.upsert({ where: { clientId_date: { clientId: me.clientId, date } }, create: { clientId: me.clientId, date, ...data }, update: data });
  await db.client.update({ where: { id: me.clientId }, data: { lastActiveAt: new Date() } });
  await recordEvent({ orgId: me.orgId, clientId: me.clientId, type: "daily.logged", actorId: me.id, payload: { sleepHours: data.sleepHours, energy: data.energy } });
  const c = await db.client.findUnique({ where: { id: me.clientId }, select: { coachId: true } });
  if (c) await recomputeClient(me.clientId, c.coachId, me.orgLocale);
  revalidatePath("/app");
}

export async function toggleHabitLogAction(formData: FormData) {
  const me = await requireClientSelf();
  const habitId = String(formData.get("habitId"));
  const habit = await db.habit.findFirst({ where: { id: habitId, clientId: me.clientId } });
  if (!habit) return;
  const date = startOfDay(new Date());
  const existing = await db.habitLog.findUnique({ where: { habitId_date: { habitId, date } } });
  const done = !(existing?.done ?? false);
  await db.habitLog.upsert({ where: { habitId_date: { habitId, date } }, create: { habitId, date, done, value: done ? habit.target : 0 }, update: { done, value: done ? habit.target : 0 } });
  await db.client.update({ where: { id: me.clientId }, data: { lastActiveAt: new Date() } });
  revalidatePath("/app");
}

// ───────────────────────────── workout ──────────────────────────────────────

export async function completeWorkoutAction(formData: FormData) {
  const me = await requireClientSelf();
  const sessionId = String(formData.get("sessionId") ?? "");
  const r = await completeWorkoutCore({ sessionId, clientId: me.clientId, orgId: me.orgId, actorId: me.id, locale: me.orgLocale, formData, byCoach: false });
  if (!r) return;
  revalidatePath("/app");
  if (r.alreadyDone) redirect("/app");
  redirect(`/app?done=${encodeURIComponent(r.workoutName)}${r.prs.length ? `&pr=${encodeURIComponent(r.prs[0])}` : ""}`);
}

const Missed = z.object({ sessionId: z.string(), reason: z.enum(FRICTION_CATEGORIES as [FrictionCategory, ...FrictionCategory[]]), choice: z.enum(["MOVE", "COMPRESS", "SKIP", "NONE"]).default("NONE"), note: z.string().max(300).optional().or(z.literal("")) });

export async function markMissedAction(formData: FormData) {
  const me = await requireClientSelf();
  const p = Missed.parse({ sessionId: formData.get("sessionId"), reason: formData.get("reason"), choice: formData.get("choice") ?? "NONE", note: formData.get("note") ?? "" });
  const s = await db.workoutSession.findFirst({ where: { id: p.sessionId, clientId: me.clientId }, include: { client: { select: { coachId: true } } } });
  if (!s || s.status === "COMPLETED") return;
  await db.workoutSession.update({ where: { id: s.id }, data: { status: p.choice === "SKIP" ? "SKIPPED" : "MISSED", missedReason: p.reason, clientNote: p.note || null } });
  if (p.choice === "MOVE" || p.choice === "COMPRESS") {
    // next free day within 3 days
    for (let i = 1; i <= 3; i++) {
      const d = addDays(startOfDay(new Date()), i);
      d.setHours(18, 0, 0, 0);
      const busy = await db.workoutSession.findFirst({ where: { clientId: me.clientId, scheduledFor: { gte: startOfDay(d), lt: addDays(startOfDay(d), 1) }, status: "SCHEDULED" } });
      if (busy) continue;
      await db.workoutSession.create({ data: { clientId: me.clientId, programId: s.programId, workoutId: s.workoutId, scheduledFor: d, status: "SCHEDULED", isShortened: p.choice === "COMPRESS" } });
      break;
    }
  }
  await recordEvent({ orgId: me.orgId, clientId: me.clientId, type: "workout.missed", actorId: me.id, payload: { reason: p.reason, choice: p.choice } });
  await recomputeClient(me.clientId, s.client.coachId, me.orgLocale);
  revalidatePath("/app");
}

// ───────────────────────────── check-in ─────────────────────────────────────

export async function submitCheckInAction(formData: FormData) {
  const me = await requireClientSelf();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const tags = FRICTION_CATEGORIES.filter((f) => formData.get(`tag:${f}`));
  const data = {
    status: "SUBMITTED",
    submittedAt: now,
    weightKg: num(formData.get("weightKg")),
    sleepAvgHours: num(formData.get("sleepAvgHours")),
    energy: num(formData.get("energy")),
    soreness: num(formData.get("soreness")),
    stress: num(formData.get("stress")),
    trainingCompleted: num(formData.get("trainingCompleted")),
    trainingPlanned: num(formData.get("trainingPlanned")),
    nutritionAdherence: num(formData.get("nutritionAdherence")),
    habitAdherencePct: num(formData.get("habitAdherencePct")),
    wins: String(formData.get("wins") ?? "").slice(0, 500) || null,
    struggles: String(formData.get("struggles") ?? "").slice(0, 500) || null,
    frictionTags: tags.join(","),
    freeText: String(formData.get("freeText") ?? "").slice(0, 1000) || null,
  };
  const client = await db.client.findUnique({ where: { id: me.clientId }, include: { goals: { where: { isPrimary: true }, take: 1 }, coach: { select: { id: true, locale: true } } } });
  if (!client) return;
  const row = await db.checkIn.upsert({ where: { clientId_weekStart: { clientId: me.clientId, weekStart } }, create: { clientId: me.clientId, weekStart, ...data }, update: data });
  const prev = await db.checkIn.findFirst({ where: { clientId: me.clientId, weekStart: { lt: weekStart }, submittedAt: { not: null } }, orderBy: { weekStart: "desc" } });
  const toSnap = (x: typeof row) => ({ ...x, frictionTags: (x.frictionTags ? x.frictionTags.split(",") : []) as FrictionCategory[] });
  const g = client.goals[0];
  const coachLocale = isLocale(client.coach.locale) ? client.coach.locale : "fr";
  const summary = summarizeCheckIn(toSnap(row), prev ? toSnap(prev) : null, g ? { id: g.id, type: g.type as GoalType, title: g.title, metric: g.metric, startValue: g.startValue, targetValue: g.targetValue, targetDate: g.targetDate, isPrimary: g.isPrimary, status: g.status } : null, coachLocale);
  await db.checkIn.update({ where: { id: row.id }, data: { summaryJson: JSON.stringify(summary) } });
  if (data.weightKg !== null) {
    await db.measurement.create({ data: { clientId: me.clientId, date: startOfDay(now), weightKg: data.weightKg, note: "check-in" } });
  }
  await db.client.update({ where: { id: me.clientId }, data: { lastActiveAt: now } });
  await recordEvent({ orgId: me.orgId, clientId: me.clientId, type: "checkin.submitted", actorId: me.id, payload: { weekStart: weekStart.toISOString().slice(0, 10), mainIssue: summary.mainIssue } });
  await db.notification.create({ data: { userId: client.coach.id, type: "checkin.submitted", title: `${client.firstName} ${client.lastName}`, body: summary.coachingFocus ?? summary.mainIssue ?? "Check-in", link: `/clients/${me.clientId}?tab=checkins` } });
  await recomputeClient(me.clientId, client.coach.id, coachLocale);
  revalidatePath("/app");
  redirect("/app?checkin=done");
}

// ───────────────────────────── messages ─────────────────────────────────────

export async function sendClientMessageAction(formData: FormData) {
  const me = await requireClientSelf();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return;
  await db.message.create({ data: { orgId: me.orgId, clientId: me.clientId, senderId: me.id, direction: "CLIENT_TO_COACH", body } });
  await db.message.updateMany({ where: { clientId: me.clientId, direction: "COACH_TO_CLIENT", readAt: null }, data: { readAt: new Date() } });
  await db.client.update({ where: { id: me.clientId }, data: { lastActiveAt: new Date() } });
  await recordEvent({ orgId: me.orgId, clientId: me.clientId, type: "message.received", actorId: me.id, payload: { preview: body.slice(0, 60) } });
  const c = await db.client.findUnique({ where: { id: me.clientId }, select: { coachId: true } });
  if (c) await recomputeClient(me.clientId, c.coachId, me.orgLocale);
  revalidatePath("/app/messages");
}

export async function markCoachMessagesReadAction() {
  const me = await requireClientSelf();
  await db.message.updateMany({ where: { clientId: me.clientId, direction: "COACH_TO_CLIENT", readAt: null }, data: { readAt: new Date() } });
}
