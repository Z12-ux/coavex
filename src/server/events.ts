import { db } from "@/server/db";

export type EventType =
  | "client.created"
  | "assessment.completed"
  | "program.created"
  | "program.activated"
  | "program.updated"
  | "workout.completed"
  | "workout.missed"
  | "measurement.recorded"
  | "checkin.submitted"
  | "checkin.reviewed"
  | "milestone.reached"
  | "message.sent"
  | "message.received"
  | "note.added"
  | "subscription.started"
  | "payment.received"
  | "daily.logged"
  | "action.completed"
  | "review.decided"
  | "photo.added";

export async function recordEvent(input: { orgId: string; clientId?: string | null; type: EventType; actorId?: string | null; payload?: Record<string, unknown>; occurredAt?: Date }) {
  await db.event.create({
    data: {
      orgId: input.orgId,
      clientId: input.clientId ?? null,
      type: input.type,
      actorId: input.actorId ?? null,
      payloadJson: JSON.stringify(input.payload ?? {}),
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

export async function audit(input: { orgId: string; actorId?: string | null; action: string; entity: string; entityId?: string | null; meta?: Record<string, unknown> }) {
  await db.auditLog.create({ data: { orgId: input.orgId, actorId: input.actorId ?? null, action: input.action, entity: input.entity, entityId: input.entityId ?? null, metaJson: JSON.stringify(input.meta ?? {}) } });
}
