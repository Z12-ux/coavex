/**
 * AI layer — one abstraction, two providers.
 *
 *  - `anthropic`: Claude (Opus 5) via the official SDK when ANTHROPIC_API_KEY is set.
 *  - `rules`: deterministic composer over the same structured facts (always available).
 *
 * Every output is assistance: editable, traceable to the facts passed in,
 * never sent automatically, never diagnostic. Errors and refusals fall back to
 * the rule-based provider so the UI always has a draft.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db, parseJson } from "@/server/db";
import { buildSnapshot } from "@/server/snapshot";
import { composeMessage, type MessageSituation, type Tone } from "@/domain/communication";
import { detectSignals } from "@/domain/signals";
import { deriveActions } from "@/domain/actions";
import { computeMomentum } from "@/domain/momentum";
import { detectDrift } from "@/domain/drift";
import { computeFriction } from "@/domain/friction";
import { tx } from "@/domain/catalog";
import { addDays, completion, daysBetween, effectiveStatus, isoDate, sessionsBetween } from "@/domain/stats";
import type { ClientSnapshot, Evidence, Locale } from "@/domain/types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const LANG: Record<Locale, string> = { fr: "French", ar: "Arabic (Modern Standard, warm and simple)", en: "English" };

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    // Organization-level keys (not scoped to a workspace) must name the workspace on every request.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000, defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined });
  }
  return client;
}

export function aiStatus(): { enabled: boolean; model: string } {
  return { enabled: !!process.env.ANTHROPIC_API_KEY, model: MODEL };
}

const GUARDRAILS = `You assist a fitness coach. Rules:
- Use ONLY the facts provided. Never invent numbers, events or medical statements. Never diagnose.
- Observations are not predictions: say what the data shows, not what will happen.
- The coach reviews and edits everything you write; write so it can be sent as-is.
- Output plain text only (no markdown, no headings, no preamble).`;

async function complete(system: string, user: string, maxTokens: number): Promise<{ text: string; ok: boolean; note?: string }> {
  const c = getClient();
  if (!c) return { text: "", ok: false, note: "no_key" };
  try {
    const res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { text: "", ok: false, note: "refusal" };
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text ? { text, ok: true } : { text: "", ok: false, note: "empty" };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { text: "", ok: false, note: "rate_limited" };
    if (err instanceof Anthropic.AuthenticationError) return { text: "", ok: false, note: "auth" };
    if (err instanceof Anthropic.APIError) return { text: "", ok: false, note: `api_${err.status}` };
    return { text: "", ok: false, note: "network" };
  }
}

// ───────────────────────────── facts ────────────────────────────────────────

function factsFor(snap: ClientSnapshot, locale: Locale) {
  const now = snap.now;
  const last7 = completion(sessionsBetween(snap.sessions, addDays(now, -7), addDays(now, 1)), now);
  const missedList = sessionsBetween(snap.sessions, addDays(now, -7), addDays(now, 1))
    .filter((s) => effectiveStatus(s, now) === "MISSED")
    .map((s) => `${isoDate(s.scheduledFor)}${s.missedReason ? ` (${tx(locale, `friction.${s.missedReason}`)})` : ""}`);
  const daysInactive = daysBetween(snap.client.lastActiveAt ?? snap.client.onboardedAt, now);
  const overdue = snap.payments.find((p) => !p.paidAt && daysBetween(p.dueAt, now) >= 3);
  const milestone = snap.milestones.find((m) => daysBetween(m.reachedAt, now) <= 7);
  const lastWeight = snap.measurements.filter((m) => m.weightKg !== null).at(-1);
  const goal = snap.goals.find((g) => g.isPrimary) ?? snap.goals[0];
  return {
    firstName: snap.client.firstName,
    goal: goal ? `${goal.title} (${goal.type})` : null,
    missedCount: last7.missed,
    plannedCount: last7.planned,
    missedList,
    daysInactive,
    overdueAmount: overdue?.amount ?? null,
    overdueDue: overdue ? isoDate(overdue.dueAt) : null,
    milestone: milestone?.title ?? null,
    lastWeightKg: lastWeight?.weightKg ?? null,
    subscriptionEnd: snap.subscription?.endDate ? isoDate(snap.subscription.endDate) : null,
  };
}

// ───────────────────────────── communication copilot ────────────────────────

export async function draftMessage(input: { clientId: string; situation: MessageSituation; tone: Tone; locale: Locale; coachName: string }): Promise<{ text: string; provider: "anthropic" | "rules"; note?: string }> {
  const snap = await buildSnapshot(input.clientId);
  const facts = snap ? factsFor(snap, input.locale) : null;
  const rules = composeMessage({
    situation: input.situation,
    tone: input.tone,
    locale: input.locale,
    clientFirstName: facts?.firstName ?? "",
    coachName: input.coachName,
    facts: { missedCount: facts?.missedCount, milestone: facts?.milestone ?? undefined, daysInactive: facts?.daysInactive, amount: facts?.overdueAmount ?? undefined, dueDate: facts?.overdueDue ?? undefined },
  });
  if (!aiStatus().enabled || !facts) return { text: rules, provider: "rules" };

  const system = `${GUARDRAILS}
Write a short message (60–120 words) from coach ${input.coachName} to their client, in ${LANG[input.locale]}. Tone: ${input.tone.toLowerCase()}. Situation: ${input.situation.replace(/_/g, " ").toLowerCase()}. End with a concrete, easy next step or question. Sign with the coach's first name.`;
  const user = `Facts (JSON): ${JSON.stringify(facts)}
Reference draft written by rules (you may improve wording but must keep the facts): ${rules}`;
  const r = await complete(system, user, 600);
  return r.ok ? { text: r.text, provider: "anthropic" } : { text: rules, provider: "rules", note: r.note };
}

// ───────────────────────────── coach copilot: client summary ────────────────

export async function summarizeClient(clientId: string, locale: Locale): Promise<{ text: string; provider: "anthropic" | "rules"; note?: string }> {
  const snap = await buildSnapshot(clientId);
  if (!snap) return { text: "", provider: "rules" };
  const signals = detectSignals(snap, locale);
  const actions = deriveActions(signals, snap, locale);
  const momentum = computeMomentum(snap, locale);
  const drift = detectDrift(snap, locale);
  const friction = computeFriction(snap, locale);

  const negatives = signals.filter((s) => s.polarity === "NEGATIVE");
  const positives = signals.filter((s) => s.polarity === "POSITIVE");
  const rulesText = [
    momentum.summary,
    negatives.length ? negatives.slice(0, 3).map((s) => s.what).join(" ") : "",
    positives.length ? positives.slice(0, 2).map((s) => s.what).join(" ") : "",
    drift.verdict !== "INSUFFICIENT_DATA" && drift.verdict !== "ON_TRACK" ? `${drift.headline} ${drift.rationale}` : "",
    friction.pattern ?? "",
    actions[0] ? `→ ${actions[0].title}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!aiStatus().enabled) return { text: rulesText, provider: "rules" };

  const system = `${GUARDRAILS}
Write a 4–6 sentence briefing for the coach in ${LANG[locale]} about this client: current momentum, the one or two things that matter most this week, what is going well, and the single recommended next action. Refer to concrete numbers from the data.`;
  const user = JSON.stringify({
    client: `${snap.client.firstName} ${snap.client.lastName}`,
    status: snap.client.status,
    goal: snap.goals.find((g) => g.isPrimary)?.title ?? null,
    momentum: { status: momentum.status, dimensions: momentum.dimensions.map((d) => ({ key: d.key, score: d.score, trend: d.trend, explanation: d.explanation })) },
    signals: signals.map((s) => ({ key: s.key, severity: s.severity, what: s.what, evidence: s.evidence })),
    drift: { verdict: drift.verdict, rationale: drift.rationale },
    friction: { top: friction.top, pattern: friction.pattern },
    nextAction: actions[0]?.title ?? null,
  });
  const r = await complete(system, user, 900);
  return r.ok ? { text: r.text, provider: "anthropic" } : { text: rulesText, provider: "rules", note: r.note };
}

// ───────────────────────────── check-in copilot ─────────────────────────────

export async function narrateCheckIn(checkInId: string, locale: Locale): Promise<{ text: string; provider: "anthropic" | "rules"; note?: string }> {
  const ci = await db.checkIn.findUnique({ where: { id: checkInId }, include: { client: { select: { firstName: true } } } });
  if (!ci) return { text: "", provider: "rules" };
  const summary = parseJson<{ mainIssue: string | null; coachingFocus: string | null; highlights: string[]; concerns: string[] } | null>(ci.summaryJson, null);
  const rulesText = summary ? [...summary.highlights, ...summary.concerns, summary.coachingFocus ? `→ ${summary.coachingFocus}` : ""].filter(Boolean).join("\n") : "";
  if (!aiStatus().enabled || !summary) return { text: rulesText, provider: "rules" };
  const system = `${GUARDRAILS}
In ${LANG[locale]}, write a 3-sentence summary of this weekly check-in for the coach, then one suggested reply sentence to the client (prefix it with "Reply:").`;
  const user = JSON.stringify({ client: ci.client.firstName, weightKg: ci.weightKg, sleepAvgHours: ci.sleepAvgHours, energy: ci.energy, soreness: ci.soreness, stress: ci.stress, training: `${ci.trainingCompleted}/${ci.trainingPlanned}`, nutritionAdherence: ci.nutritionAdherence, habitAdherencePct: ci.habitAdherencePct, wins: ci.wins, struggles: ci.struggles, frictionTags: ci.frictionTags, freeText: ci.freeText, structuredSummary: summary });
  const r = await complete(system, user, 600);
  return r.ok ? { text: r.text, provider: "anthropic" } : { text: rulesText, provider: "rules", note: r.note };
}

export type { Evidence };
