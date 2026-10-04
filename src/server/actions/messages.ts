"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertClientInOrg, requirePermission, requireStaff } from "@/server/auth/session";
import { recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import { MESSAGE_SITUATIONS, TONES, type MessageSituation, type Tone } from "@/domain/communication";
import { draftMessage } from "@/server/ai";

const Send = z.object({ clientId: z.string(), body: z.string().trim().min(1).max(4000), channel: z.enum(["APP", "WHATSAPP", "EMAIL"]).default("APP"), source: z.enum(["MANUAL", "ASSISTED", "TEMPLATE"]).default("MANUAL") });

export async function sendMessageAction(formData: FormData) {
  const user = await requirePermission("messages:send");
  const p = Send.parse({ clientId: formData.get("clientId"), body: formData.get("body"), channel: formData.get("channel") ?? "APP", source: formData.get("source") ?? "MANUAL" });
  const c = await assertClientInOrg(p.clientId, user.orgId);
  await db.message.create({ data: { orgId: user.orgId, clientId: p.clientId, senderId: user.id, direction: "COACH_TO_CLIENT", channel: p.channel, body: p.body, source: p.source } });
  // replying marks the client's messages as read
  await db.message.updateMany({ where: { clientId: p.clientId, direction: "CLIENT_TO_COACH", readAt: null }, data: { readAt: new Date() } });
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "message.sent", actorId: user.id, payload: { preview: p.body.slice(0, 60), channel: p.channel, source: p.source } });
  await recomputeClient(p.clientId, c.coachId, user.locale);
  revalidatePath(`/messages/${p.clientId}`);
  revalidatePath("/messages");
  revalidatePath("/");
}

export async function markReadAction(clientId: string) {
  const user = await requireStaff();
  await assertClientInOrg(clientId, user.orgId);
  await db.message.updateMany({ where: { clientId, direction: "CLIENT_TO_COACH", readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/messages");
}

const Draft = z.object({ clientId: z.string(), situation: z.enum(MESSAGE_SITUATIONS as [MessageSituation, ...MessageSituation[]]), tone: z.enum(TONES as [Tone, ...Tone[]]), locale: z.enum(["fr", "ar", "en"]) });

export type DraftResult = { text: string; provider: "anthropic" | "rules"; note?: string };

export async function draftMessageAction(input: z.infer<typeof Draft>): Promise<DraftResult> {
  const user = await requirePermission("messages:send");
  const p = Draft.parse(input);
  await assertClientInOrg(p.clientId, user.orgId);
  return draftMessage({ clientId: p.clientId, situation: p.situation, tone: p.tone, locale: p.locale, coachName: user.name });
}
