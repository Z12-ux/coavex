import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const orgId = user.orgId;

  const like = q ? { contains: q } : undefined;
  const [clients, notes, checkIns, programs, exercises] = await Promise.all([
    db.client.findMany({
      where: { orgId, ...(like ? { OR: [{ firstName: like }, { lastName: like }, { email: like }, { phone: like }, { tags: like }] } : {}) },
      select: { id: true, firstName: true, lastName: true, status: true },
      orderBy: [{ status: "asc" }, { firstName: "asc" }],
      take: q ? 8 : 6,
    }),
    q
      ? db.coachNote.findMany({ where: { client: { orgId }, content: like }, select: { id: true, content: true, clientId: true, client: { select: { firstName: true, lastName: true } } }, take: 5 })
      : Promise.resolve([]),
    q
      ? db.checkIn.findMany({ where: { client: { orgId }, OR: [{ wins: like }, { struggles: like }, { freeText: like }] }, select: { id: true, clientId: true, weekStart: true, client: { select: { firstName: true, lastName: true } } }, take: 5 })
      : Promise.resolve([]),
    q ? db.program.findMany({ where: { client: { orgId }, name: like }, select: { id: true, name: true, clientId: true }, take: 5 }) : Promise.resolve([]),
    q ? db.exercise.findMany({ where: { OR: [{ orgId }, { orgId: null }], name: like }, select: { id: true, name: true, muscleGroup: true }, take: 5 }) : Promise.resolve([]),
  ]);

  const results = [
    ...clients.map((c) => ({ type: "client", id: c.id, title: `${c.firstName} ${c.lastName}`, sub: c.status, href: `/clients/${c.id}` })),
    ...programs.map((p) => ({ type: "program", id: p.id, title: p.name, sub: "Programme", href: `/clients/${p.clientId}/programs/${p.id}` })),
    ...notes.map((n) => ({ type: "note", id: n.id, title: n.content.slice(0, 80), sub: `${n.client.firstName} ${n.client.lastName}`, href: `/clients/${n.clientId}?tab=notes` })),
    ...checkIns.map((c) => ({ type: "checkin", id: c.id, title: `Check-in ${c.weekStart.toISOString().slice(0, 10)}`, sub: `${c.client.firstName} ${c.client.lastName}`, href: `/clients/${c.clientId}?tab=checkins` })),
    ...exercises.map((e) => ({ type: "exercise", id: e.id, title: e.name, sub: e.muscleGroup, href: `/settings?tab=exercises` })),
  ];
  return NextResponse.json({ results });
}
