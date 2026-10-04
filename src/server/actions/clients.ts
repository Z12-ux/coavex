"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { assertClientInOrg, requirePermission, requireStaff } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password";
import { audit, recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import { checkImageDataUrl, PHOTO_POSES, storeImage } from "@/server/storage";
import { CLIENT_STATUSES, GOAL_TYPES } from "@/domain/types";

export type FormState = { error?: string; ok?: boolean } | undefined;

const CreateClient = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  preferredLocale: z.enum(["fr", "ar", "en"]).default("fr"),
  goalType: z.enum(GOAL_TYPES as [string, ...string[]]),
  goalTitle: z.string().trim().min(1).max(160),
  startWeight: z.coerce.number().min(20).max(400).optional().or(z.literal("")),
  targetWeight: z.coerce.number().min(20).max(400).optional().or(z.literal("")),
  targetDate: z.string().optional().or(z.literal("")),
  plannedSessionsPerWeek: z.coerce.number().int().min(1).max(7).default(3),
  checkInWeekday: z.coerce.number().int().min(0).max(6).default(0),
  createLogin: z.string().optional(),
  password: z.string().min(8).max(100).optional().or(z.literal("")),
});

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("clients:write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = CreateClient.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const d = parsed.data;
  const email = d.email || null;

  let userId: string | null = null;
  if (d.createLogin && email) {
    if (!d.password) return { error: "password" };
    const exists = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return { error: "email_taken" };
    const u = await db.user.create({ data: { orgId: user.orgId, email: email.toLowerCase(), passwordHash: await hashPassword(d.password), name: `${d.firstName} ${d.lastName}`, role: "CLIENT", locale: d.preferredLocale } });
    userId = u.id;
  }

  const client = await db.client.create({
    data: {
      orgId: user.orgId,
      coachId: user.id,
      userId,
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone || null,
      email,
      preferredLocale: d.preferredLocale,
      plannedSessionsPerWeek: d.plannedSessionsPerWeek,
      checkInWeekday: d.checkInWeekday,
      status: "ONBOARDING",
      goals: {
        create: {
          type: d.goalType,
          title: d.goalTitle,
          metric: "weightKg",
          startValue: d.startWeight === "" || d.startWeight === undefined ? null : d.startWeight,
          targetValue: d.targetWeight === "" || d.targetWeight === undefined ? null : d.targetWeight,
          targetDate: d.targetDate ? new Date(d.targetDate) : null,
          isPrimary: true,
        },
      },
    },
  });
  if (d.startWeight !== "" && d.startWeight !== undefined) {
    await db.measurement.create({ data: { clientId: client.id, date: new Date(), weightKg: d.startWeight } });
  }
  await recordEvent({ orgId: user.orgId, clientId: client.id, type: "client.created", actorId: user.id, payload: { name: `${d.firstName} ${d.lastName}` } });
  await recomputeClient(client.id, user.id, user.locale);
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

const UpdateStatus = z.object({ clientId: z.string(), status: z.enum(CLIENT_STATUSES as [string, ...string[]]) });

export async function updateClientStatusAction(formData: FormData) {
  const user = await requirePermission("clients:write");
  const p = UpdateStatus.parse({ clientId: formData.get("clientId"), status: formData.get("status") });
  await assertClientInOrg(p.clientId, user.orgId);
  await db.client.update({ where: { id: p.clientId }, data: { status: p.status } });
  const c = await db.client.findUnique({ where: { id: p.clientId }, select: { coachId: true } });
  if (c) await recomputeClient(p.clientId, c.coachId, user.locale);
  revalidatePath(`/clients/${p.clientId}`);
  revalidatePath("/clients");
}

const Note = z.object({ clientId: z.string(), category: z.string().max(30), content: z.string().trim().min(1).max(2000), pinned: z.string().optional() });

export async function addNoteAction(formData: FormData) {
  const user = await requirePermission("notes:write");
  const p = Note.parse({ clientId: formData.get("clientId"), category: formData.get("category"), content: formData.get("content"), pinned: formData.get("pinned") ?? undefined });
  await assertClientInOrg(p.clientId, user.orgId);
  await db.coachNote.create({ data: { clientId: p.clientId, authorId: user.id, category: p.category, content: p.content, pinned: !!p.pinned } });
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "note.added", actorId: user.id, payload: { category: p.category } });
  revalidatePath(`/clients/${p.clientId}`);
}

export async function toggleNotePinAction(formData: FormData) {
  const user = await requirePermission("notes:write");
  const id = String(formData.get("noteId"));
  const n = await db.coachNote.findFirst({ where: { id, client: { orgId: user.orgId } } });
  if (!n) return;
  await db.coachNote.update({ where: { id }, data: { pinned: !n.pinned } });
  revalidatePath(`/clients/${n.clientId}`);
}

export async function deleteNoteAction(formData: FormData) {
  const user = await requirePermission("notes:write");
  const id = String(formData.get("noteId"));
  const n = await db.coachNote.findFirst({ where: { id, client: { orgId: user.orgId } } });
  if (!n) return;
  await db.coachNote.delete({ where: { id } });
  revalidatePath(`/clients/${n.clientId}`);
}

const Measurement = z.object({
  clientId: z.string(),
  date: z.string().min(8),
  weightKg: z.coerce.number().min(20).max(400).optional().or(z.literal("")),
  waistCm: z.coerce.number().min(30).max(250).optional().or(z.literal("")),
  bodyFatPct: z.coerce.number().min(2).max(70).optional().or(z.literal("")),
  note: z.string().max(300).optional().or(z.literal("")),
});

export async function addMeasurementAction(formData: FormData) {
  const user = await requireStaff();
  const p = Measurement.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  const num = (x: number | "" | undefined) => (x === "" || x === undefined ? null : x);
  await db.measurement.create({ data: { clientId: p.clientId, date: new Date(p.date), weightKg: num(p.weightKg), waistCm: num(p.waistCm), bodyFatPct: num(p.bodyFatPct), note: p.note || null } });
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "measurement.recorded", actorId: user.id, payload: { weightKg: num(p.weightKg) } });
  const c = await db.client.findUnique({ where: { id: p.clientId }, select: { coachId: true } });
  if (c) await recomputeClient(p.clientId, c.coachId, user.locale);
  revalidatePath(`/clients/${p.clientId}`);
}

// ───────────────────────────── progress photos ──────────────────────────────

const Photo = z.object({
  clientId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pose: z.enum(PHOTO_POSES),
  note: z.string().trim().max(200).optional().or(z.literal("")),
  dataUrl: z.string().min(40),
});

/** Coach adds a photo for a client (image already resized in the browser, sent as a data URL). */
export async function addProgressPhotoAction(formData: FormData) {
  const user = await requirePermission("clients:write");
  const p = Photo.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  const img = checkImageDataUrl(p.dataUrl);
  if (!img.ok) throw new Error(img.error);
  const url = await storeImage(img);
  await db.progressPhoto.create({ data: { clientId: p.clientId, date: new Date(p.date), url, pose: p.pose, note: p.note || null } });
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "photo.added", actorId: user.id, occurredAt: new Date(p.date), payload: { pose: p.pose, by: "COACH" } });
  revalidatePath(`/clients/${p.clientId}`);
}

export async function deleteProgressPhotoAction(formData: FormData) {
  const user = await requirePermission("clients:write");
  const id = String(formData.get("photoId") ?? "");
  const ph = await db.progressPhoto.findFirst({ where: { id, client: { orgId: user.orgId } }, select: { id: true, clientId: true } });
  if (!ph) return;
  await db.progressPhoto.delete({ where: { id: ph.id } });
  await audit({ orgId: user.orgId, actorId: user.id, action: "photo.delete", entity: "ProgressPhoto", entityId: ph.id });
  revalidatePath(`/clients/${ph.clientId}`);
}

const Habit = z.object({ clientId: z.string(), name: z.string().trim().min(1).max(80), kind: z.string().max(20).default("CUSTOM"), target: z.coerce.number().min(0).max(100000).default(1), unit: z.string().max(10).default(""), daysPerWeek: z.coerce.number().int().min(1).max(7).default(7) });

export async function addHabitAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const p = Habit.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  await db.habit.create({ data: { clientId: p.clientId, name: p.name, kind: p.kind, target: p.target, unit: p.unit, daysPerWeek: p.daysPerWeek } });
  revalidatePath(`/clients/${p.clientId}`);
}

export async function toggleHabitAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const id = String(formData.get("habitId"));
  const h = await db.habit.findFirst({ where: { id, client: { orgId: user.orgId } } });
  if (!h) return;
  await db.habit.update({ where: { id }, data: { active: !h.active } });
  revalidatePath(`/clients/${h.clientId}`);
}

const Nutrition = z.object({ clientId: z.string(), approach: z.string().max(20).default("FLEXIBLE"), caloriesTarget: z.coerce.number().int().min(800).max(8000).optional().or(z.literal("")), proteinG: z.coerce.number().int().min(0).max(500).optional().or(z.literal("")), carbsG: z.coerce.number().int().min(0).max(1000).optional().or(z.literal("")), fatG: z.coerce.number().int().min(0).max(400).optional().or(z.literal("")), notes: z.string().max(1000).optional().or(z.literal("")) });

export async function setNutritionPlanAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const p = Nutrition.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  const num = (x: number | "" | undefined) => (x === "" || x === undefined ? null : x);
  await db.nutritionPlan.updateMany({ where: { clientId: p.clientId, active: true }, data: { active: false } });
  await db.nutritionPlan.create({ data: { clientId: p.clientId, approach: p.approach, caloriesTarget: num(p.caloriesTarget), proteinG: num(p.proteinG), carbsG: num(p.carbsG), fatG: num(p.fatG), notes: p.notes || null } });
  revalidatePath(`/clients/${p.clientId}`);
}

const Milestone = z.object({ clientId: z.string(), kind: z.string().max(20).default("CUSTOM"), title: z.string().trim().min(1).max(120), detail: z.string().max(300).optional().or(z.literal("")) });

export async function addMilestoneAction(formData: FormData) {
  const user = await requirePermission("clients:write");
  const p = Milestone.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  await db.milestone.create({ data: { clientId: p.clientId, kind: p.kind, title: p.title, detail: p.detail || null, highlighted: true } });
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "milestone.reached", actorId: user.id, payload: { title: p.title } });
  revalidatePath(`/clients/${p.clientId}`);
}

export async function toggleMilestoneHighlightAction(formData: FormData) {
  const user = await requirePermission("clients:write");
  const id = String(formData.get("milestoneId"));
  const m = await db.milestone.findFirst({ where: { id, client: { orgId: user.orgId } } });
  if (!m) return;
  await db.milestone.update({ where: { id }, data: { highlighted: !m.highlighted } });
  revalidatePath(`/clients/${m.clientId}`);
}

const ClientSettings = z.object({ clientId: z.string(), plannedSessionsPerWeek: z.coerce.number().int().min(1).max(7), checkInWeekday: z.coerce.number().int().min(0).max(6), preferredLocale: z.enum(["fr", "ar", "en"]), phone: z.string().max(30).optional().or(z.literal("")), tags: z.string().max(200).optional().or(z.literal("")) });

export async function updateClientSettingsAction(formData: FormData) {
  const user = await requirePermission("clients:write");
  const p = ClientSettings.parse(Object.fromEntries(formData.entries()));
  await assertClientInOrg(p.clientId, user.orgId);
  await db.client.update({ where: { id: p.clientId }, data: { plannedSessionsPerWeek: p.plannedSessionsPerWeek, checkInWeekday: p.checkInWeekday, preferredLocale: p.preferredLocale, phone: p.phone || null, tags: p.tags ?? "" } });
  revalidatePath(`/clients/${p.clientId}`);
}
