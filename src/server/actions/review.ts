"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { requirePermission } from "@/server/auth/session";
import { recordEvent } from "@/server/events";
import { buildSnapshot } from "@/server/snapshot";
import { buildWeeklyReview } from "@/domain/review";
import { startOfWeek } from "@/domain/stats";

export async function generateWeeklyReviewAction() {
  const user = await requirePermission("review:run");
  const weekStart = startOfWeek(new Date());
  const review = await db.weeklyReview.upsert({ where: { coachId_weekStart: { coachId: user.id, weekStart } }, create: { orgId: user.orgId, coachId: user.id, weekStart }, update: {} });
  const clients = await db.client.findMany({ where: { orgId: user.orgId, status: { in: ["ACTIVE", "TRIAL", "ONBOARDING"] } }, select: { id: true } });
  for (const c of clients) {
    const snap = await buildSnapshot(c.id);
    if (!snap) continue;
    const summary = buildWeeklyReview(snap, user.locale);
    const existing = await db.weeklyReviewItem.findUnique({ where: { reviewId_clientId: { reviewId: review.id, clientId: c.id } } });
    if (existing && existing.decision !== "PENDING") continue; // keep decided items
    await db.weeklyReviewItem.upsert({ where: { reviewId_clientId: { reviewId: review.id, clientId: c.id } }, create: { reviewId: review.id, clientId: c.id, summaryJson: JSON.stringify(summary) }, update: { summaryJson: JSON.stringify(summary) } });
  }
  revalidatePath("/review");
  // Post/Redirect/Get: a fresh GET is more robust than re-rendering 13 cards inside the action response.
  redirect("/review");
}

const Decide = z.object({ itemId: z.string(), decision: z.enum(["APPROVED", "EDITED", "IGNORED", "FOLLOW_UP"]), coachNote: z.string().max(1000).optional().or(z.literal("")) });

export async function decideReviewItemAction(formData: FormData) {
  const user = await requirePermission("review:run");
  const p = Decide.parse({ itemId: formData.get("itemId"), decision: formData.get("decision"), coachNote: formData.get("coachNote") ?? "" });
  const item = await db.weeklyReviewItem.findFirst({ where: { id: p.itemId, review: { orgId: user.orgId } } });
  if (!item) return;
  await db.weeklyReviewItem.update({ where: { id: item.id }, data: { decision: p.decision, coachNote: p.coachNote || null, decidedAt: new Date() } });
  if (p.decision === "FOLLOW_UP") {
    await db.action.upsert({
      where: { clientId_fingerprint: { clientId: item.clientId, fingerprint: `FOLLOWUP:${item.reviewId}` } },
      create: { clientId: item.clientId, coachId: user.id, kind: "SCHEDULE_FOLLOWUP", title: user.locale === "ar" ? "متابعة مقررة في المراجعة الأسبوعية" : user.locale === "en" ? "Follow-up decided in weekly review" : "Suivi décidé en revue hebdo", reason: p.coachNote || "", priority: 55, fingerprint: `FOLLOWUP:${item.reviewId}`, dueAt: new Date(Date.now() + 2 * 86_400_000) },
      update: { status: "OPEN", reason: p.coachNote || "" },
    });
  }
  await recordEvent({ orgId: user.orgId, clientId: item.clientId, type: "review.decided", actorId: user.id, payload: { decision: p.decision, note: p.coachNote || null } });
  revalidatePath("/review");
  revalidatePath(`/clients/${item.clientId}`);
}

export async function completeReviewAction(formData: FormData) {
  const user = await requirePermission("review:run");
  const reviewId = String(formData.get("reviewId"));
  const r = await db.weeklyReview.findFirst({ where: { id: reviewId, coachId: user.id } });
  if (!r) return;
  await db.weeklyReview.update({ where: { id: r.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  revalidatePath("/review");
}
