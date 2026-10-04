# COAVEX — Project documentation (Galuxium Nexus V2 submission)

Live demo: https://coach-os-wine.vercel.app (demo mode, seeded data; logins in the README)
Built: September 28 – October 2026, inside the hackathon window. Solo entrant.

## Market friction
- Independent coaches and small studios run 20–150 clients on WhatsApp, spreadsheets and memory. They spend 30–40 % of
  the week on admin and follow-up, with no prioritization.
- Churn is silent: the client stops logging, then stops coming, then stops paying. Existing tools alert at the last step.
- Gym software is built for front desks (scheduling, billing, access control), not for the coaching relationship.
- MENA / Francophone market: no product with Arabic (RTL), French and English in one interface and darija-aware messaging.

## What COAVEX does
Two faces of one multi-tenant SaaS.

**Coach command center** — Today (sessions, missed, pending check-ins, unanswered messages) and an **Attention Queue**
ranked by urgency. Each row: who · what · why (the data) · next best action · Done.

**Client Signal Engine** — 22 evidence-backed signals (missed workouts, consistency drop, sleep decline, plateau, stagnant
load, engagement drop, check-in overdue, friction pattern, payment overdue…). Every signal carries *what / why / data /
suggested action* and a fingerprint, so nothing is duplicated and everything is explainable.

**Next Best Action** — merges related signals (missed + poor sleep → "review recovery before progressing volume") and
includes an explicit **Do nothing**.

**Momentum profile & program drift** — 7 explainable dimensions; planned vs actual separates *program issue* from
*adherence issue* from *life friction*.

**Weekly review** — one card per client: status → what changed → went well → went wrong → needs attention → action,
with approve / edit / ignore.

**Communication assistant** — FR / AR / EN drafts grounded in the client's real facts. Claude when configured, rules
otherwise. Never auto-sent.

**Client app** — today's workout, habits, nutrition targets, 2-minute check-in, missed-session "why?", My Journey,
before/after progress photos.

**Business view** — subscriptions, overdue/upcoming payments, MRR, feeding payment and renewal signals.

## Target users
1. Independent online / in-person coaches (20–60 clients).
2. Studios and small gyms with 2–10 coaches sharing clients (owner / admin / coach / assistant roles).
3. Gym chains (roadmap): SSO, audit export, multi-location.

## Architecture
- **Stack:** Next.js 15 (App Router, RSC, server actions), React 19, TypeScript strict, Tailwind v4 tokens (light/dark, RTL),
  Prisma (SQLite in dev, PostgreSQL in production; no provider-specific features).
- **Domain layer:** pure, deterministic engines in `src/domain/*` (signals, actions, momentum, drift, friction, check-in
  summary, program). Testable without a database.
- **Intelligence persistence:** fingerprinted rows (`src/server/intelligence.ts`), lazy recompute (15 min) and recompute
  after every meaningful write. Idempotent by construction.
- **AI provider abstraction:** `src/server/ai` — Anthropic SDK (`claude-opus-5`) or a rule-based provider. Outputs are drafts;
  a human approves. Keys live only in server environment variables.
- **Events:** an `Event` table (`client.created`, `workout.completed`, `checkin.submitted`, …) drives the profile timeline
  and the client's Journey — and doubles as an audit trail.
- **Mutations:** zod-validated server actions through `src/components/action-form.tsx`, which refreshes the route after
  every action so the UI never shows stale data.
- **Scaling:** stateless app instances on Vercel; all heavy work is per-client and idempotent; no cron dependency;
  PostgreSQL pooled connections in production.
- **Deployment modes:** demo (bundled seeded SQLite per serverless instance, stateless signed sessions) and production
  (`DATABASE_URL` + `DIRECT_URL`, `scripts/build.mjs` switches to `prisma/schema.postgres.prisma`).

## Enterprise governance & compliance
- **Tenancy & RBAC:** every row carries `orgId`; the role matrix (`src/lib/rbac.ts`: OWNER / ADMIN / COACH / ASSISTANT /
  CLIENT) is enforced in server actions and layouts; clients can only reach `/app*` and their own rows (covered by the
  e2e redirect tests).
- **Authentication:** DB-backed sessions with hashed opaque tokens in httpOnly cookies, scrypt password hashing, login
  rate limiting; demo mode uses signed stateless sessions with a server secret.
- **Input validation:** every mutation is a zod-validated server action.
- **Data minimization:** progress photos are resized in the browser (≤ 1280 px JPEG) before upload; AI prompts contain only
  the facts needed for the draft; no third-party analytics.
- **Human-in-the-loop AI:** no message is sent and no program is changed automatically; every recommendation shows the
  data it is based on.
- **Auditability:** the Event table records who did what and when.
- **Portability:** standard PostgreSQL schema, no vendor-specific features; per-organization export on the roadmap.
- **Secrets hygiene:** `.env` is git-ignored, `.env.example` documents every variable, dependencies pinned, RBAC and
  engines covered by the vitest suite.

## Verification
- `npm test` — vitest suite on engines and RBAC.
- `npm run e2e` — Playwright walk-through of every coach and client screen at desktop and mobile widths (auth + RBAC
  redirects, client profile tabs, weekly review generate + approve, message assistant draft + send, Ctrl+K palette,
  client daily log, workout logging, check-in submit).

## Roadmap
Payment gateways and invoicing (transactional loop), multi-location, object storage for photos, native apps,
AI usage metering per organization, SSO and audit export for gym chains.
