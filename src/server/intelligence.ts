/**
 * Runs the engines for one client or a whole organization and persists the
 * results (Signals, Actions) idempotently via fingerprints.
 *
 *  - a signal that is re-detected keeps its row (lastSeenAt refreshed)
 *  - a signal that is no longer detected is marked resolved
 *  - dismissed signals stay dismissed until their fingerprint changes
 *  - actions follow the same rule; completed actions are never re-opened
 */

import { db } from "@/server/db";
import { buildSnapshot } from "@/server/snapshot";
import { detectSignals } from "@/domain/signals";
import { deriveActions } from "@/domain/actions";
import { addDays } from "@/domain/stats";
import type { Locale } from "@/domain/types";

export async function recomputeClient(clientId: string, coachId: string, locale: Locale, now = new Date()) {
  const snap = await buildSnapshot(clientId, now);
  if (!snap) return { signals: 0, actions: 0 };
  const signals = detectSignals(snap, locale);
  const actions = deriveActions(signals, snap, locale);

  const existing = await db.signal.findMany({ where: { clientId, resolvedAt: null } });
  const seen = new Set<string>();
  for (const s of signals) {
    seen.add(s.fingerprint);
    const row = existing.find((e) => e.fingerprint === s.fingerprint);
    if (row) {
      await db.signal.update({ where: { id: row.id }, data: { lastSeenAt: now, severity: s.severity, what: s.what, why: s.why, evidenceJson: JSON.stringify(s.evidence), suggestedAction: s.suggestedAction, title: s.title } });
    } else {
      await db.signal.upsert({
        where: { clientId_fingerprint: { clientId, fingerprint: s.fingerprint } },
        create: { clientId, key: s.key, severity: s.severity, polarity: s.polarity, title: s.title, what: s.what, why: s.why, evidenceJson: JSON.stringify(s.evidence), suggestedAction: s.suggestedAction, fingerprint: s.fingerprint, detectedAt: now, lastSeenAt: now },
        update: { lastSeenAt: now, resolvedAt: null, severity: s.severity, what: s.what, why: s.why, evidenceJson: JSON.stringify(s.evidence), title: s.title },
      });
    }
  }
  for (const e of existing) if (!seen.has(e.fingerprint)) await db.signal.update({ where: { id: e.id }, data: { resolvedAt: now } });

  const openActions = await db.action.findMany({ where: { clientId, status: { in: ["OPEN", "SNOOZED"] } } });
  const seenA = new Set<string>();
  for (const a of actions) {
    seenA.add(a.fingerprint);
    const row = openActions.find((e) => e.fingerprint === a.fingerprint);
    if (row) {
      await db.action.update({ where: { id: row.id }, data: { priority: a.priority, reason: a.reason, title: a.title } });
    } else {
      await db.action.upsert({
        where: { clientId_fingerprint: { clientId, fingerprint: a.fingerprint } },
        create: { clientId, coachId, kind: a.kind, title: a.title, reason: a.reason, priority: a.priority, fingerprint: a.fingerprint, sourceSignalKeys: a.sourceSignalKeys.join(","), dueAt: a.dueInDays === undefined ? null : addDays(now, a.dueInDays) },
        update: {},
      });
    }
  }
  for (const e of openActions) if (!seenA.has(e.fingerprint)) await db.action.update({ where: { id: e.id }, data: { status: "DISMISSED" } });
  return { signals: signals.length, actions: actions.length };
}

export async function recomputeOrganization(orgId: string, locale: Locale, now = new Date()) {
  const clients = await db.client.findMany({ where: { orgId, status: { not: "CHURNED" } }, select: { id: true, coachId: true } });
  let signals = 0;
  let actions = 0;
  for (const c of clients) {
    const r = await recomputeClient(c.id, c.coachId, locale, now);
    signals += r.signals;
    actions += r.actions;
  }
  await db.organization.update({ where: { id: orgId }, data: { signalsComputedAt: now } });
  return { clients: clients.length, signals, actions };
}

/** Recompute lazily when results are older than `maxAgeMinutes`. */
export async function ensureFresh(orgId: string, locale: Locale, maxAgeMinutes = 15) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { signalsComputedAt: true } });
  if (!org) return;
  if (!org.signalsComputedAt || Date.now() - org.signalsComputedAt.getTime() > maxAgeMinutes * 60_000) {
    await recomputeOrganization(orgId, locale);
  }
}
