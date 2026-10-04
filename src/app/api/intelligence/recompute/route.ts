import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { can } from "@/lib/rbac";
import { recomputeOrganization } from "@/server/intelligence";

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "intelligence:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await recomputeOrganization(user.orgId, user.locale);
  return NextResponse.json(r);
}
