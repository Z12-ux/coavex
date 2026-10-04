/**
 * FRICTION ENGINE
 *
 * Aggregates WHY a client fails to follow the plan: missed-session reasons
 * captured at the moment of the miss, plus friction tags from check-ins.
 * Produces the questions the coach should ask next.
 */

import { tx } from "./catalog";
import { addDays, effectiveStatus, sessionsBetween } from "./stats";
import type { ClientSnapshot, FrictionCategory, FrictionProfile, Locale } from "./types";

export function computeFriction(snap: ClientSnapshot, locale: Locale = "fr"): FrictionProfile {
  const now = snap.now;
  const counts = new Map<FrictionCategory, number>();
  const bump = (c: FrictionCategory, w = 1) => counts.set(c, (counts.get(c) ?? 0) + w);

  for (const s of sessionsBetween(snap.sessions, addDays(now, -28), addDays(now, 1))) {
    if (effectiveStatus(s, now) === "MISSED" && s.missedReason) bump(s.missedReason);
  }
  for (const c of snap.checkIns.slice(-4)) for (const t of c.frictionTags) bump(t);

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({ category, count, sharePct: total ? Math.round((count / total) * 100) : 0 }));

  const pattern = total >= 3 && top[0] && top[0].sharePct >= 50 ? tx(locale, "friction.pattern", { pct: top[0].sharePct, category: tx(locale, `friction.${top[0].category}`) }) : null;
  const questions = top.map((t) => tx(locale, `friction.q.${t.category}`));
  if (!questions.length) questions.push(tx(locale, "friction.q.OTHER"));
  return { total, top, pattern, questions };
}
