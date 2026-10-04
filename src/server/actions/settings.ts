"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requirePermission, requireUser } from "@/server/auth/session";

export async function setLocaleAction(formData: FormData) {
  const user = await requireUser();
  const locale = z.enum(["fr", "ar", "en"]).parse(formData.get("locale"));
  await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}

const Org = z.object({ name: z.string().trim().min(2).max(80), locale: z.enum(["fr", "ar", "en"]) });

export async function updateOrgAction(formData: FormData) {
  const user = await requirePermission("org:manage");
  const p = Org.parse({ name: formData.get("name"), locale: formData.get("locale") });
  await db.organization.update({ where: { id: user.orgId }, data: { name: p.name, locale: p.locale } });
  revalidatePath("/", "layout");
}

const Exercise = z.object({ name: z.string().trim().min(2).max(80), muscleGroup: z.string().max(20), pattern: z.string().max(20), equipment: z.string().max(20), isMainLift: z.string().optional() });

export async function addExerciseAction(formData: FormData) {
  const user = await requirePermission("programs:write");
  const p = Exercise.parse(Object.fromEntries(formData.entries()));
  await db.exercise.create({ data: { orgId: user.orgId, name: p.name, muscleGroup: p.muscleGroup, pattern: p.pattern, equipment: p.equipment, isMainLift: !!p.isMainLift, isCompound: ["SQUAT", "HINGE", "PUSH_H", "PUSH_V", "PULL_H", "PULL_V", "LUNGE"].includes(p.pattern) } });
  revalidatePath("/settings");
}
