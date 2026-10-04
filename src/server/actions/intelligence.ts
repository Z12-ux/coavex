"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requirePermission, requireStaff } from "@/server/auth/session";
import { recomputeClient, recomputeOrganization } from "@/server/intelligence";
import { recordEvent } from "@/server/events";
import { addDays } from "@/domain/stats";

export async function recomputeAllAction() {
  const user = await requirePermission("intelligence:run");
  await recomputeOrganization(user.orgId, user.locale);
  revalidatePath("/", "layout");
}

export async function recomputeClientAction(clientId: string) {
  const user = await requirePermission("intelligence:run");
  const c = await db.client.findFirst({ where: { id: clientId, orgId: user.orgId }, select: { coachId: true } });
  if (!c) return;
  await recomputeClient(clientId, c.coachId, user.locale);
  revalidatePath(`/clients/${clientId}`);
}

const ActionDecision = z.object({ actionId: z.string(), decision: z.enum(["DONE", "SNOOZED", "DISMISSED"]), days: z.coerce.number().int().min(1).max(30).optional() });

export async function decideActionAction(formData: FormData) {
  const user = await requireStaff();
  const p = ActionDecision.parse({ actionId: formData.get("actionId"), decision: formData.get("decision"), days: formData.get("days") || undefined });
  const a = await db.action.findFirst({ where: { id: p.actionId, client: { orgId: user.orgId } } });
  if (!a) return;
  await db.action.update({
    where: { id: a.id },
    data: p.decision === "DONE" ? { status: "DONE", completedAt: new Date() } : p.decision === "SNOOZED" ? { status: "SNOOZED", snoozedUntil: addDays(new Date(), p.days ?? 2) } : { status: "DISMISSED" },
  });
  if (p.decision === "DONE") await recordEvent({ orgId: user.orgId, clientId: a.clientId, type: "action.completed", actorId: user.id, payload: { kind: a.kind, title: a.title } });
  revalidatePath("/");
  revalidatePath(`/clients/${a.clientId}`);
}

const SignalDecision = z.object({ signalId: z.string(), decision: z.enum(["RESOLVED", "DISMISSED"]) });

export async function decideSignalAction(formData: FormData) {
  const user = await requireStaff();
  const p = SignalDecision.parse({ signalId: formData.get("signalId"), decision: formData.get("decision") });
  const s = await db.signal.findFirst({ where: { id: p.signalId, client: { orgId: user.orgId } } });
  if (!s) return;
  await db.signal.update({ where: { id: s.id }, data: p.decision === "RESOLVED" ? { resolvedAt: new Date() } : { dismissedAt: new Date() } });
  revalidatePath("/");
  revalidatePath(`/clients/${s.clientId}`);
}
