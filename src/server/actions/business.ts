"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertClientInOrg, requirePermission } from "@/server/auth/session";
import { recordEvent } from "@/server/events";
import { recomputeClient } from "@/server/intelligence";
import { addDays } from "@/domain/stats";

const Sub = z.object({ clientId: z.string(), packageName: z.string().trim().min(1).max(80), amount: z.coerce.number().int().min(0).max(10_000_000), billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "ONE_OFF"]).default("MONTHLY"), startDate: z.string().min(8), months: z.coerce.number().int().min(1).max(24).default(3), status: z.enum(["TRIAL", "ACTIVE"]).default("ACTIVE") });

export async function createSubscriptionAction(formData: FormData) {
  const user = await requirePermission("business:write");
  const p = Sub.parse(Object.fromEntries(formData.entries()));
  const c = await assertClientInOrg(p.clientId, user.orgId);
  const start = new Date(p.startDate);
  const end = addDays(start, p.months * 30);
  await db.subscription.updateMany({ where: { clientId: p.clientId, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } }, data: { status: "EXPIRED", endDate: new Date() } });
  const sub = await db.subscription.create({ data: { clientId: p.clientId, packageName: p.packageName, amount: p.amount, billingCycle: p.billingCycle, startDate: start, endDate: end, status: p.status } });
  if (p.amount > 0) {
    const n = p.billingCycle === "MONTHLY" ? p.months : p.billingCycle === "QUARTERLY" ? Math.ceil(p.months / 3) : 1;
    const step = p.billingCycle === "MONTHLY" ? 30 : p.billingCycle === "QUARTERLY" ? 90 : p.months * 30;
    for (let i = 0; i < n; i++) await db.payment.create({ data: { subscriptionId: sub.id, clientId: p.clientId, amount: p.amount, dueAt: addDays(start, i * step), status: "PENDING" } });
  }
  await recordEvent({ orgId: user.orgId, clientId: p.clientId, type: "subscription.started", actorId: user.id, payload: { package: p.packageName, amount: p.amount } });
  await recomputeClient(p.clientId, c.coachId, user.locale);
  revalidatePath(`/clients/${p.clientId}`);
  revalidatePath("/business");
}

const Pay = z.object({ paymentId: z.string(), method: z.enum(["CASH", "TRANSFER", "CCP", "CARD"]).default("CASH"), reference: z.string().max(80).optional().or(z.literal("")) });

export async function markPaymentPaidAction(formData: FormData) {
  const user = await requirePermission("business:write");
  const p = Pay.parse({ paymentId: formData.get("paymentId"), method: formData.get("method") ?? "CASH", reference: formData.get("reference") ?? "" });
  const pay = await db.payment.findFirst({ where: { id: p.paymentId, client: { orgId: user.orgId } }, include: { client: { select: { coachId: true } } } });
  if (!pay) return;
  await db.payment.update({ where: { id: pay.id }, data: { status: "PAID", paidAt: new Date(), method: p.method, reference: p.reference || null } });
  if (pay.subscriptionId) {
    const remaining = await db.payment.count({ where: { subscriptionId: pay.subscriptionId, status: "OVERDUE" } });
    if (!remaining) await db.subscription.updateMany({ where: { id: pay.subscriptionId, status: "PAST_DUE" }, data: { status: "ACTIVE" } });
  }
  await recordEvent({ orgId: user.orgId, clientId: pay.clientId, type: "payment.received", actorId: user.id, payload: { amount: pay.amount, method: p.method } });
  await recomputeClient(pay.clientId, pay.client.coachId, user.locale);
  revalidatePath(`/clients/${pay.clientId}`);
  revalidatePath("/business");
  revalidatePath("/");
}
