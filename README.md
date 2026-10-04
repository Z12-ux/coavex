# COAVEX — Fitness Coaching Operating System

> Product renamed from *CoachOS* to **COAVEX** on 2026-09-30 (branding only — see `docs/BRAND-RENAME-COAVEX.md`). Technical identifiers such as the `coach-os` folder, `coachos_*` storage keys and the `@coachos.demo` demo logins are unchanged.

COAVEX answers two questions from one intelligent environment:

- **Coach:** *Which client needs my attention right now, why, and what should I do next?*
- **Client:** *What should I do today, why, and am I actually progressing?*

It is not a gym dashboard and not a CRUD app: every screen is organised as **what matters now → context → details → actions**, and every recommendation is explainable from stored data.

## Quick start

```bash
npm install
npm run db:push      # creates prisma/dev.db (SQLite)
npm run db:seed      # 15 realistic clients + signals/actions computed
npm run dev          # http://localhost:3210
```

Demo logins: `coach@coachos.demo / coach1234` (owner), `assistant@coachos.demo / coach1234`, clients `ahmed@ / sara@ / karim@ / lina@ / walid@coachos.demo` with `client1234`.

Optional AI copilots: set `ANTHROPIC_API_KEY` in `.env` (model `claude-opus-5` by default). Without a key COAVEX uses the rule-based composer and says so in the UI.

## What is inside

| Area | Where | What it does |
|---|---|---|
| Command Center | `/` | Today (sessions, missed, pending check-ins, unanswered messages, plans to revisit) + **Attention Queue** ranked by urgency with the next best action per client |
| Client Signal Engine | `src/domain/signals.ts` | 22 evidence-backed signals (missed workouts, consistency drop, sleep decline, plateau, performance up, stagnant load, engagement, check-in overdue, friction pattern, payment overdue…) each with *what / why / data / suggested action* and a fingerprint for idempotent persistence |
| Next Best Action | `src/domain/actions.ts` | Ranked action queue, merges related signals (e.g. missed + sleep → "review recovery before progressing volume"), explicit **Do nothing** |
| Momentum profile | `src/domain/momentum.ts` | 7 explainable dimensions (consistency, adherence, performance, recovery, habits, engagement, goal progress) → improving / stable / declining |
| Program drift | `src/domain/drift.ts` | Planned vs actual (frequency, progression, habits, duration) → **program issue** vs **adherence issue** vs **life friction** |
| Friction engine | `src/domain/friction.ts` | Aggregates missed-session reasons and check-in tags → recurring pattern + questions the coach should ask |
| Check-in → summary | `src/domain/checkin.ts` | 2-minute client check-in → structured summary (arrows, main issue, coaching focus) the coach approves / edits / ignores |
| Weekly review | `/review` | One card per client: status → what changed → went well → went wrong → needs attention → action, with approve / edit / ignore / follow-up |
| Adaptive program | `src/domain/program.ts` | Double progression / linear / RPE suggestions, missed-session options (move / compress / coach review / skip), deload hints. Nothing applies automatically |
| Communication assistant | `/messages/[client]` | Situations × tones × FR/AR/EN drafts from real facts; Claude when configured, rules otherwise; never auto-sent |
| Client profile | `/clients/[id]` | Single source of truth: actions, signals, drift, friction, goal, momentum, weight, before/after photos, program, pinned notes, 10 tabs (photos, training, nutrition, recovery, habits, check-ins, timeline, notes, business) |
| Progress photos | `/clients/[id]?tab=photos`, `/app/progress` | Before / after comparison (drag slider or side by side, per pose, any two dates), delta in days / kg / waist from the nearest measurements, timeline of thumbnails; coach and client upload from the phone, the browser resizes to ≤1280 px JPEG and the image is stored with the record (`src/server/storage.ts` is the seam for object storage). Demo data ships stylised silhouettes generated from each client's measurements (`prisma/demo-photos.ts`), labelled as illustrations |
| Client app | `/app` | Today (workout, habits, nutrition targets, daily log, check-in due, missed-session "why?"), workout logging with progression prefill and PR detection, check-in, **My Journey**, progress |
| Business | `/business` | Subscriptions, overdue / upcoming payments, MRR; feeds payment & renewal signals |
| Universal search | Ctrl/⌘ K | Clients, programs, notes, check-ins, exercises + quick actions |
| Visual language | `docs/01-UX-AUDIT.md` §7 | Greeting header, one dark hero card for the next thing to do, ring gauges, stat cards with deltas and sparklines, week strips, area charts — distilled from current fitness-app references, on top of a calm one-accent system with light/dark and RTL |

## Coach on the gym floor (mobile-first)

- **Today** answers NEXT · PENDING · DONE before anything else; the attention queue is grouped Urgent / Attention / Watch / Good news and every row is who · what · next action · Done.
- **Workout mode** (`/clients/[id]/train/[sessionId]`, and `/app/workout/[sessionId]` for clients): one exercise at a time, ±steppers, copy previous set, one-tap set completion → rest timer (pause, +30 s, skip, vibration), sticky progress and finish. Immersive: navigation hides.
- **Quick actions** floating button on phones, contextual action bar on every client profile (Message · Workout · Check-in · Note), sticky client header.
- **Keyboard** on desktop: `/` or Ctrl+K palette (with recent clients), `N` `C` `A` `R` `M` `T` navigation; hints in the sidebar and palette.
- Feedback everywhere: success/error toasts, busy forms, contextual verbs. Design tokens, typography scale and motion tokens in `src/app/globals.css`; audit and decisions in `docs/01-UX-AUDIT.md`.

## Architecture

- **Next.js 15 (App Router, RSC, server actions)**, React 19, Tailwind v4 tokens (light/dark), TypeScript strict.
- **Prisma** with SQLite in dev; switch `provider` to `postgresql` for production (no provider-specific features used).
- **Tenancy:** Organization → Users (OWNER / ADMIN / COACH / ASSISTANT / CLIENT) → Clients. All queries scoped by `orgId`; RBAC matrix in `src/lib/rbac.ts` enforced in server actions/layouts. Clients can only reach `/app*` and their own rows.
- **Auth:** DB-backed sessions (hashed opaque token, httpOnly cookie), scrypt passwords, login rate limit.
- **Intelligence:** pure functions over a `ClientSnapshot` (`src/domain/*`), persisted with fingerprints (`src/server/intelligence.ts`), recomputed lazily (15 min) and after every meaningful write.
- **Mutations:** server actions (zod-validated) submitted through `src/components/action-form.tsx`, which refreshes the route after every action so the UI never shows stale data.
- **Timeline:** `Event` table (`client.created`, `workout.completed`, `checkin.submitted`, …) drives the profile timeline and the client's Journey.
- **i18n:** FR / AR (RTL) / EN dictionaries for UI (`src/lib/i18n`) and engine texts (`src/domain/catalog.ts`); message drafts follow the client's language.
- **AI:** `src/server/ai` — Anthropic SDK (`claude-opus-5`, server-side refusal fallbacks) behind an abstraction with a rule-based provider; keys stay server-side.

## Scripts

```bash
npm run typecheck   # tsc
npm test            # vitest — 41 tests on engines, RBAC
npm run build       # prisma generate + next build
npm run e2e         # playwright-core smoke against a running server (screenshots in e2e-shots/)
node scripts/run-e2e.mjs   # builds nothing: starts `next start`, runs the e2e, stops the server
# e2e covers: auth + RBAC redirects, every coach screen at desktop and mobile widths, client profile tabs,
# action done, weekly review generate + approve, message assistant draft + send, Ctrl+K palette,
# client daily log, missed-session reason, workout logging, check-in submit, message, coach sees both.
npm run db:reset    # wipe + push + seed
```

## Deploy

- **Vercel, demo mode (no database to provision):** `npx vercel deploy --prod` (or `--temporary` without an account). With no `DATABASE_URL` the app runs on the bundled seeded SQLite (`prisma/seed.db`) copied to the function's temp dir: every screen and flow works, but writes live only as long as the instance and each instance has its own copy. In this mode sessions are signed cookies (`src/server/auth/stateless.ts`) instead of DB rows, so a login is valid on every instance; set `SESSION_SECRET` on the project. Refresh the snapshot with `npm run db:seed:snapshot`.
- **Vercel, real database:** set `DATABASE_URL` (pooled, `?pgbouncer=true&schema=coachos`) and `DIRECT_URL` on the project; `scripts/build.mjs` switches to `prisma/schema.postgres.prisma` automatically. Run `npx prisma db push --schema prisma/schema.postgres.prisma` once (with `DIRECT_URL`) and optionally `npx tsx prisma/seed.ts` to load the demo data.
- Optional: `ANTHROPIC_API_KEY` enables the copilots.

## Roadmap (not built yet, on purpose)

Payment gateways & invoices, multi-location, native apps, automatic sending, automatic program changes, object storage for photos (today the resized image lives with the record).
