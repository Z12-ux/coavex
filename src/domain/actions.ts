/**
 * NEXT BEST ACTION
 *
 * Turns detected signals into a ranked action queue for the coach.
 * The engine never acts; it eliminates cognitive overload by telling the
 * coach what deserves attention first and why. "Do nothing" is a valid,
 * explicit outcome.
 */

import { tx } from "./catalog";
import type { ActionDraft, ActionKind, ClientSnapshot, Locale, SignalDraft, SignalKey } from "./types";

const SEV_BONUS = { URGENT: 30, ATTENTION: 15, WATCH: 5, INFO: 0 } as const;

interface Rule {
  kind: ActionKind;
  base: number;
  dueInDays?: number;
}

const RULES: Partial<Record<SignalKey, Rule>> = {
  UNANSWERED_MESSAGE: { kind: "REPLY_MESSAGE", base: 70, dueInDays: 0 },
  ONBOARDING_STALLED: { kind: "CREATE_PROGRAM", base: 70, dueInDays: 1 },
  NO_ACTIVE_PROGRAM: { kind: "CREATE_PROGRAM", base: 70, dueInDays: 1 },
  CHECKIN_OVERDUE: { kind: "REQUEST_CHECKIN", base: 60, dueInDays: 0 },
  MISSED_WORKOUTS: { kind: "REVIEW_MISSED", base: 55, dueInDays: 1 },
  TRAINING_CONSISTENCY_DROP: { kind: "REVIEW_MISSED", base: 50, dueInDays: 2 },
  ADHERENCE_DECLINING: { kind: "REVIEW_MISSED", base: 45, dueInDays: 3 },
  ENGAGEMENT_LOW: { kind: "RE_ENGAGE", base: 55, dueInDays: 1 },
  PAYMENT_OVERDUE: { kind: "REVIEW_PAYMENT", base: 50, dueInDays: 1 },
  FRICTION_PATTERN: { kind: "REVIEW_FRICTION", base: 55, dueInDays: 3 },
  SLEEP_DECLINE: { kind: "REVIEW_RECOVERY", base: 45, dueInDays: 3 },
  RECOVERY_LOW: { kind: "REVIEW_RECOVERY", base: 45, dueInDays: 3 },
  STRESS_HIGH: { kind: "REVIEW_RECOVERY", base: 40, dueInDays: 3 },
  LOAD_STAGNANT: { kind: "ADJUST_PROGRESSION", base: 45, dueInDays: 5 },
  WEIGHT_PLATEAU: { kind: "REVIEW_NUTRITION", base: 40, dueInDays: 5 },
  WEIGHT_TREND_AGAINST_GOAL: { kind: "REVIEW_NUTRITION", base: 45, dueInDays: 3 },
  NUTRITION_ADHERENCE_LOW: { kind: "REVIEW_NUTRITION", base: 45, dueInDays: 3 },
  HABIT_LOW: { kind: "SEND_ENCOURAGEMENT", base: 35, dueInDays: 3 },
  SUBSCRIPTION_ENDING: { kind: "SCHEDULE_FOLLOWUP", base: 40, dueInDays: 5 },
  PERFORMANCE_UP: { kind: "CELEBRATE", base: 30, dueInDays: 5 },
  MILESTONE_REACHED: { kind: "CELEBRATE", base: 35, dueInDays: 3 },
  CONSISTENCY_STREAK: { kind: "CELEBRATE", base: 30, dueInDays: 5 },
};

function fp(kind: ActionKind, signals: SignalDraft[]): string {
  return `${kind}:${signals.map((s) => s.fingerprint).sort().join("|")}`;
}

export function deriveActions(signals: SignalDraft[], snap: ClientSnapshot, locale: Locale = "fr"): ActionDraft[] {
  const byKind = new Map<ActionKind, { priority: number; signals: SignalDraft[]; dueInDays?: number }>();

  const has = (k: SignalKey) => signals.some((s) => s.key === k);

  // Combination rule: missed sessions + recovery problems → one clear action
  // instead of two competing ones, with the safest recommendation.
  const recoveryKeys: SignalKey[] = ["SLEEP_DECLINE", "RECOVERY_LOW", "STRESS_HIGH"];
  const trainingKeys: SignalKey[] = ["MISSED_WORKOUTS", "TRAINING_CONSISTENCY_DROP", "ADHERENCE_DECLINING"];
  const combined = trainingKeys.some(has) && recoveryKeys.some(has);
  if (combined) {
    const src = signals.filter((s) => [...trainingKeys, ...recoveryKeys].includes(s.key));
    const priority = Math.min(100, 65 + Math.max(...src.map((s) => SEV_BONUS[s.severity])));
    byKind.set("REVIEW_RECOVERY", { priority, signals: src, dueInDays: 1 });
  }

  for (const s of signals) {
    const rule = RULES[s.key];
    if (!rule) continue;
    if (combined && [...trainingKeys, ...recoveryKeys].includes(s.key)) continue;
    const priority = Math.min(100, rule.base + SEV_BONUS[s.severity]);
    const cur = byKind.get(rule.kind);
    if (cur) {
      cur.priority = Math.max(cur.priority, priority);
      cur.signals.push(s);
      cur.dueInDays = Math.min(cur.dueInDays ?? 99, rule.dueInDays ?? 99);
    } else byKind.set(rule.kind, { priority, signals: [s], dueInDays: rule.dueInDays });
  }

  // Submitted but unreviewed check-in → explicit action even without a signal.
  const pendingCi = snap.checkIns.filter((c) => c.status === "SUBMITTED" && !c.coachReviewedAt).at(-1);
  if (pendingCi) {
    byKind.set("REVIEW_CHECKIN", { priority: 62, signals: [], dueInDays: 0 });
  }

  const actions: ActionDraft[] = [];
  for (const [kind, v] of byKind) {
    const reason = v.signals.length
      ? v.signals.map((s) => s.what).join(" ")
      : kind === "REVIEW_CHECKIN"
        ? locale === "fr"
          ? "Un check-in a été envoyé et attend une réponse."
          : locale === "ar"
            ? "تم إرسال تقرير أسبوعي وينتظر الرد."
            : "A check-in was submitted and awaits your response."
        : "";
    actions.push({
      kind,
      title: tx(locale, `act.${kind}.title`),
      reason,
      priority: v.priority,
      sourceSignalKeys: v.signals.map((s) => s.key),
      fingerprint: fp(kind, v.signals) + (kind === "REVIEW_CHECKIN" && pendingCi ? `:${pendingCi.id}` : ""),
      dueInDays: v.dueInDays,
    });
  }

  const negativeAttention = signals.some((s) => s.polarity === "NEGATIVE" && s.severity !== "INFO");
  if (!negativeAttention && !pendingCi && ["ACTIVE", "TRIAL"].includes(snap.client.status)) {
    actions.push({
      kind: "NO_ACTION",
      title: tx(locale, "act.NO_ACTION.title"),
      reason: tx(locale, "act.NO_ACTION.reason"),
      priority: 5,
      sourceSignalKeys: [],
      fingerprint: `NO_ACTION:${snap.now.toISOString().slice(0, 10)}`,
    });
  }

  return actions.sort((a, b) => b.priority - a.priority);
}
