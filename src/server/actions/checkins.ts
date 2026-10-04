"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, parseJson } from "@/server/db";
import { requirePermission } from "@/server/auth/session";
import { recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import type { CheckInSummary } from "@/domain/types";

const Review = z.object({ checkInId: z.string(), coachResponse: z.string().max(2000).optional().or(z.literal("")), mainIssue: z.string().max(120).optional().or(z.literal("")), coachingFocus: z.string().max(200).optional().or(z.literal("")), decision: z.enum(["APPROVE", "EDIT", "IGNORE"]).default("APPROVE"), sendMessage: z.string().optional() });

export async function reviewCheckInAction(formData: FormData) {
  const user = await requirePermission("checkins:review");
  const p = Review.parse(Object.fromEntries(formData.entries()));
  const ci = await db.checkIn.findFirst({ where: { id: p.checkInId, client: { orgId: user.orgId } }, include: { client: { select: { coachId: true, id: true } } } });
  if (!ci) return;
  const summary = parseJson<CheckInSummary | null>(ci.summaryJson, null);
  const edited = p.decision === "EDIT" && summary ? { ...summary, mainIssue: p.mainIssue || summary.mainIssue, coachingFocus: p.coachingFocus || summary.coachingFocus } : summary;
  await db.checkIn.update({ where: { id: ci.id }, data: { status: "REVIEWED", coachReviewedAt: new Date(), coachResponse: p.coachResponse || null, summaryJson: edited ? JSON.stringify(edited) : ci.summaryJson } });
  if (p.sendMessage && p.coachResponse) {
    await db.message.create({ data: { orgId: user.orgId, clientId: ci.clientId, senderId: user.id, direction: "COACH_TO_CLIENT", body: p.coachResponse, source: "MANUAL" } });
    await recordEvent({ orgId: user.orgId, clientId: ci.clientId, type: "message.sent", actorId: user.id, payload: { preview: p.coachResponse.slice(0, 60) } });
  }
  await recordEvent({ orgId: user.orgId, clientId: ci.clientId, type: "checkin.reviewed", actorId: user.id, payload: { decision: p.decision } });
  await recomputeClient(ci.clientId, ci.client.coachId, user.locale);
  revalidatePath(`/clients/${ci.clientId}`);
  revalidatePath("/");
  revalidatePath("/review");
}
