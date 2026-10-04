/**
 * Read models for coach screens. Every query is scoped by orgId.
 */

import { db, parseJson } from "@/server/db";
import { addDays, completion, startOfDay, startOfWeek } from "@/domain/stats";
import type { Evidence, Locale, Severity, SessionStatus, SnapshotSession } from "@/domain/types";
import { buildSnapshot } from "@/server/snapshot";
import { computeMomentum } from "@/domain/momentum";

export interface QueueSignal {
  id: string;
  key: string;
  severity: Severity;
  polarity: string;
  title: string;
  what: string;
  why: string;
  evidence: Evidence[];
  suggestedAction: string | null;
  detectedAt: Date;
}

export interface QueueAction {
  id: string;
  kind: string;
  title: string;
  reason: string;
  priority: number;
  dueAt: Date | null;
  status: string;
}

export interface QueueItem {
  client: { id: string; firstName: string; lastName: string; status: string; preferredLocale: string };
  topAction: QueueAction | null;
  actions: QueueAction[];
  signals: QueueSignal[];
  maxSeverity: Severity;
}

const SEV: Record<Severity, number> = { URGENT: 3, ATTENTION: 2, WATCH: 1, INFO: 0 };

export async function attentionQueue(orgId: string, opts: { includeCalm?: boolean } = {}): Promise<QueueItem[]> {
  const clients = await db.client.findMany({
    where: { orgId, status: { not: "CHURNED" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      preferredLocale: true,
      signals: { where: { resolvedAt: null, dismissedAt: null }, orderBy: { detectedAt: "desc" } },
      actions: { where: { status: "OPEN" }, orderBy: { priority: "desc" } },
    },
  });
  const items: QueueItem[] = clients.map((c) => {
    const signals: QueueSignal[] = c.signals.map((s) => ({ id: s.id, key: s.key, severity: s.severity as Severity, polarity: s.polarity, title: s.title, what: s.what, why: s.why, evidence: parseJson<Evidence[]>(s.evidenceJson, []), suggestedAction: s.suggestedAction, detectedAt: s.detectedAt }));
    const actions: QueueAction[] = c.actions.map((a) => ({ id: a.id, kind: a.kind, title: a.title, reason: a.reason, priority: a.priority, dueAt: a.dueAt, status: a.status }));
    const maxSeverity = signals.filter((s) => s.polarity === "NEGATIVE").reduce<Severity>((m, s) => (SEV[s.severity] > SEV[m] ? s.severity : m), "INFO");
    return { client: { id: c.id, firstName: c.firstName, lastName: c.lastName, status: c.status, preferredLocale: c.preferredLocale }, topAction: actions[0] ?? null, actions, signals, maxSeverity };
  });
  const filtered = opts.includeCalm ? items : items.filter((i) => i.topAction && i.topAction.kind !== "NO_ACTION");
  return filtered.sort((a, b) => (b.topAction?.priority ?? 0) - (a.topAction?.priority ?? 0) || SEV[b.maxSeverity] - SEV[a.maxSeverity]);
}

export async function todayStats(orgId: string, coachId: string, now = new Date()) {
  const day0 = startOfDay(now);
  const day1 = addDays(day0, 1);
  // exercises → muscle groups for the Today hero muscle map (additive: every other field unchanged)
  const sessionInclude = { client: { select: { id: true, firstName: true, lastName: true } }, workout: { select: { name: true, estimatedMinutes: true, focus: true, exercises: { select: { exercise: { select: { muscleGroup: true } } } } } } } as const;
  const [sessionsToday, completedTodayList, missed7, pendingCheckinsList, unansweredList, plansAttention, clientsAttention, actionsDoneToday, org, clientCount, nextAfterToday] = await Promise.all([
    db.workoutSession.findMany({ where: { client: { orgId }, scheduledFor: { gte: day0, lt: day1 }, status: { notIn: ["SKIPPED", "RESCHEDULED"] } }, include: sessionInclude, orderBy: { scheduledFor: "asc" } }),
    db.workoutSession.findMany({ where: { client: { orgId }, completedAt: { gte: day0, lt: day1 } }, include: sessionInclude, orderBy: { completedAt: "desc" } }),
    db.workoutSession.count({ where: { client: { orgId }, status: "MISSED", scheduledFor: { gte: addDays(day0, -7), lt: day1 } } }),
    db.checkIn.findMany({ where: { client: { orgId }, status: "SUBMITTED", coachReviewedAt: null }, select: { id: true, submittedAt: true, client: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { submittedAt: "asc" } }),
    db.message.findMany({ where: { orgId, direction: "CLIENT_TO_COACH", readAt: null }, select: { clientId: true, createdAt: true, body: true, client: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } }),
    db.action.count({ where: { coachId, status: "OPEN", kind: { in: ["ADJUST_PROGRESSION", "UPDATE_PROGRAM", "CREATE_PROGRAM", "REVIEW_FRICTION"] } } }),
    db.action.count({ where: { coachId, status: "OPEN", priority: { gte: 60 } } }),
    db.action.count({ where: { coachId, status: "DONE", completedAt: { gte: day0, lt: day1 } } }),
    db.organization.findUnique({ where: { id: orgId }, select: { signalsComputedAt: true } }),
    db.client.count({ where: { orgId } }),
    db.workoutSession.findFirst({ where: { client: { orgId }, status: "SCHEDULED", scheduledFor: { gte: day1 } }, include: sessionInclude, orderBy: { scheduledFor: "asc" } }),
  ]);
  const nextSession = sessionsToday.find((s) => s.status === "SCHEDULED" && s.scheduledFor >= now) ?? sessionsToday.find((s) => s.status === "SCHEDULED") ?? nextAfterToday;

  // Org-wide adherence trend (last 8 weeks) and deltas vs the previous period
  const [missedPrev7, recent] = await Promise.all([
    db.workoutSession.count({ where: { client: { orgId }, status: "MISSED", scheduledFor: { gte: addDays(day0, -14), lt: addDays(day0, -7) } } }),
    db.workoutSession.findMany({ where: { client: { orgId }, scheduledFor: { gte: addDays(day0, -56), lt: day1 }, status: { in: ["COMPLETED", "MISSED", "SCHEDULED"] } }, select: { scheduledFor: true, status: true } }),
  ]);
  const rateBetween = (from: Date, to: Date): number | null => {
    let c = 0;
    let m = 0;
    for (const s of recent) {
      if (s.scheduledFor < from || s.scheduledFor >= to) continue;
      if (s.status === "COMPLETED") c++;
      else if (s.status === "MISSED" || (s.status === "SCHEDULED" && s.scheduledFor < day0)) m++;
    }
    return c + m ? c / (c + m) : null;
  };
  const weekStart = startOfWeek(now);
  return {
    missedPrev7,
    adherence14: rateBetween(addDays(day0, -14), day1),
    adherencePrev14: rateBetween(addDays(day0, -28), addDays(day0, -14)),
    weeklyRates: Array.from({ length: 8 }, (_, i) => rateBetween(addDays(weekStart, -7 * (7 - i)), addDays(weekStart, -7 * (6 - i)))),
    sessionsToday,
    completedTodayList,
    completedToday: completedTodayList.length,
    missed7,
    pendingCheckinsList,
    pendingCheckins: pendingCheckinsList.length,
    unansweredList,
    unanswered: unansweredList.length,
    plansAttention,
    clientsAttention,
    actionsDoneToday,
    nextSession,
    clientCount,
    signalsComputedAt: org?.signalsComputedAt ?? null,
  };
}

export interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  preferredLocale: string;
  lastCheckIn: Date | null;
  adherence28: number | null;
  nextSession: Date | null;
  signalCount: number;
  maxSeverity: Severity | null;
  momentum: "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
  weekly: (number | null)[];
  topAction: string | null;
}

export async function clientRows(orgId: string, locale: Locale, now = new Date()): Promise<ClientRow[]> {
  const clients = await db.client.findMany({
    where: { orgId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      preferredLocale: true,
      checkIns: { where: { submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true } },
      workoutSessions: { where: { scheduledFor: { gte: addDays(now, -35), lt: addDays(now, 14) } }, select: { id: true, scheduledFor: true, status: true, completedAt: true } },
      signals: { where: { resolvedAt: null, dismissedAt: null, polarity: "NEGATIVE" }, select: { severity: true } },
      actions: { where: { status: "OPEN" }, orderBy: { priority: "desc" }, take: 1, select: { title: true, kind: true } },
    },
    orderBy: [{ firstName: "asc" }],
  });
  const rows: ClientRow[] = [];
  for (const c of clients) {
    const sessions: SnapshotSession[] = c.workoutSessions.map((s) => ({ id: s.id, scheduledFor: s.scheduledFor, status: s.status as SessionStatus, completedAt: s.completedAt, durationMin: null, sessionRpe: null, isShortened: false, missedReason: null, workoutName: null }));
    const c28 = completion(sessions.filter((s) => s.scheduledFor >= addDays(now, -28) && s.scheduledFor <= now), now);
    const weekly: (number | null)[] = [];
    const thisWeek = startOfWeek(now);
    for (let i = 4; i >= 1; i--) {
      const from = addDays(thisWeek, -7 * i);
      const to = addDays(thisWeek, -7 * (i - 1));
      const w = completion(sessions.filter((s) => s.scheduledFor >= from && s.scheduledFor < to), now);
      weekly.push(w.rate);
    }
    const next = sessions.filter((s) => s.status === "SCHEDULED" && s.scheduledFor >= startOfDay(now)).sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
    const maxSeverity = c.signals.reduce<Severity | null>((m, s) => (m === null || SEV[s.severity as Severity] > SEV[m] ? (s.severity as Severity) : m), null);
    let momentum: ClientRow["momentum"] = "INSUFFICIENT_DATA";
    if (c.status !== "CHURNED") {
      const snap = await buildSnapshot(c.id, now);
      if (snap) momentum = computeMomentum(snap, locale).status;
    }
    rows.push({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      status: c.status,
      preferredLocale: c.preferredLocale,
      lastCheckIn: c.checkIns[0]?.submittedAt ?? null,
      adherence28: c28.rate === null ? null : Math.round(c28.rate * 100),
      nextSession: next?.scheduledFor ?? null,
      signalCount: c.signals.length,
      maxSeverity,
      momentum,
      weekly,
      topAction: c.actions[0] && c.actions[0].kind !== "NO_ACTION" ? c.actions[0].title : null,
    });
  }
  return rows;
}
