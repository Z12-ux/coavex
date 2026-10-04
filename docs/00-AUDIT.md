# CoachOS — Discovery audit (2026-09-28)

## 0. What was found in the repository

The working directory is a general workspace holding ~100 unrelated projects (LHIMA ERP, Hanout POS, Vetocare, Mouna…). **No fitness-coaching application, code, data model or design existed anywhere** (searched Desktop, Downloads, Documents, c:\tmp for fitness/coach/gym/workout/training). The only "coach" hit is a script that *removes* a nutrition-coach page from a food-industry site.

Consequence: there is nothing to preserve or refactor. The audit therefore covers (a) the reusable house patterns found in sibling projects and (b) the product problems of a professional coach, which is what the system must solve.

### Reusable house patterns (kept)
| Pattern | Source project | Reused in CoachOS |
|---|---|---|
| Next.js 15 App Router + React 19 + TypeScript | vetocare, mouna-platform, hanini-nahnik-oms | yes |
| Prisma + server-side RBAC (`requirePermission`) | mouna-platform | yes (DB-backed sessions, no JWT needed) |
| Domain logic as pure functions + vitest | hanout-pos, cafe-pos | yes (all intelligence engines are pure and tested) |
| Playwright screenshot smoke scripts | hanout-pos | yes (`scripts/e2e.mjs`) |
| Comma-tagged status strings + zod (Postgres-portable SQLite) | — | yes |

## 1. What the product currently does
Nothing yet. Starting point = empty folder.

## 2. The 10 biggest problems (of the coach, since there is no legacy app)
1. The coach cannot answer "who needs me today and why" without opening every client.
2. Missed sessions are recorded as facts, never explained (no friction capture).
3. Planned program vs actual behaviour is never compared, so bad programs and bad adherence look identical.
4. Progress is judged on body weight alone; performance, recovery, habits and engagement are invisible.
5. Weekly check-ins arrive as unstructured WhatsApp text; the coach re-reads everything.
6. Coach memory (injuries, dislikes, dates, equipment) lives in the coach's head or scattered notes.
7. Messages are rewritten from scratch every time, in three languages.
8. Disengagement is noticed when the client has already stopped paying.
9. Business admin (renewals, overdue payments) is mixed with coaching.
10. Clients do not know what to do *today* and why.

## 3. The 10 highest-value opportunities
1. Command Center: Today + Attention Queue, one screen.
2. Client Signal Engine: explainable, evidence-backed signals (what / why / data / next action).
3. Next-Best-Action queue ranked by urgency, including "do nothing".
4. Program Drift detection (planned vs actual) with the bad-program / bad-adherence / life-friction distinction.
5. Friction Engine: missed-session reasons + check-in struggle tags → why the plan fails.
6. 90-second client check-in → structured summary the coach approves/edits.
7. Weekly Review workflow with approve / edit / ignore / follow-up.
8. Momentum profile across 7 dimensions, each explainable.
9. Communication assistant (tone × language, never auto-sent).
10. Coach memory surfaced in context (pinned notes on profile, program, messages).

## 4. Recommended product architecture
Single Next.js 15 application, two experiences:
- **Coach OS** (`/`): command center, clients, client profile (single source of truth), programs, agenda, weekly review, messages, analytics, business.
- **Client app** (`/app`): Today, workout logging, daily log, weekly check-in, Journey, messages. Mobile-first with a bottom tab bar.
Intelligence lives in `src/domain/*` as pure functions over a `ClientSnapshot`; the server builds snapshots from Prisma and persists results (Signals, Actions) with fingerprints so coaches can dismiss/resolve them.

## 5. Recommended UX architecture
Every screen: **what matters now → context → details → actions**. Command palette (Ctrl/⌘+K) for search + quick actions. Calm neutral palette, one accent, dense but readable tables, skeletons, explicit empty states with the next step, human error copy.

## 6. Recommended database / domain architecture
See `prisma/schema.prisma`. Tenancy = Organization → Users (roles) → Clients. Every intelligence output (Signal, Action, WeeklyReviewItem) is a row with a fingerprint. Timeline = `Event` table (`client.created`, `workout.completed`, …). SQLite in dev, Postgres in prod (no provider-specific features used).

## 7. Differentiation (workflow, not "AI")
Three mechanisms, all explainable from stored data:
1. **Signal → Action loop**: signals are evidence objects; actions are derived and ranked; the coach decides.
2. **Drift + Friction**: planned vs actual, and the *reason* behind the gap, captured at the moment the client misses.
3. **Check-in → Weekly Review pipeline**: client input becomes a structured summary the coach approves in seconds.

## 8. Phased roadmap
1. Discovery (this document) — done.
2. Foundation: schema, auth, RBAC, design system, seed.
3. Core loop: client profile, program, workouts, check-ins, progress, timeline.
4. Intelligence: signals, actions, momentum, drift, friction, weekly review.
5. Business: subscriptions, payments, retention view.
6. Polish: responsive, empty/loading/error states, accessibility, e2e.

## 9. Risks and trade-offs
- SQLite in dev means no enums/JSON columns → strings validated by zod. Accepted for portability.
- Rule-based intelligence is deterministic and testable; it will not "understand" free text. LLM copilots are an optional layer behind `ANTHROPIC_API_KEY`, with a rule-based composer as fallback (clearly labelled).
- Single coach first; multi-coach org is supported by the model but the UI is not optimised for it yet.

## 10. What should NOT be built yet
- Payment gateway integrations, invoices PDF, multi-location, marketplace.
- Native mobile apps (PWA-grade responsive web is enough).
- Automatic message sending, automatic program changes (coach must approve).
- Medical/diagnostic language anywhere.
