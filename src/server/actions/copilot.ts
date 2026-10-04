"use server";

import { assertClientInOrg, requireStaff } from "@/server/auth/session";
import { narrateCheckIn, summarizeClient } from "@/server/ai";
import { db } from "@/server/db";

export async function briefingAction(clientId: string) {
  const user = await requireStaff();
  await assertClientInOrg(clientId, user.orgId);
  return summarizeClient(clientId, user.locale);
}

export async function checkInNarrativeAction(checkInId: string) {
  const user = await requireStaff();
  const ci = await db.checkIn.findFirst({ where: { id: checkInId, client: { orgId: user.orgId } }, select: { id: true } });
  if (!ci) return { text: "", provider: "rules" as const };
  return narrateCheckIn(checkInId, user.locale);
}
