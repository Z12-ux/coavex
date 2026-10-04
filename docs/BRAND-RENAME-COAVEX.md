# Brand rename: CoachOS → COAVEX (2026-09-30)

This change is about naming only. No feature, workflow, data model, architecture or verified claim changed. No tagline was invented. The existing "Le système d'exploitation du coach" / "The coach's operating system" (`app.tagline`) is kept.

## 1. Audit method

The search covered `CoachOS`, `CoachOs`, `COACHOS`, `coachos`, `Coach OS`, the split wordmark `Coach` + `OS`, and `app.name`. It ran over the whole repository (build output and `node_modules` handled separately) and over the workspace marketing system (`marketing/_system`, `marketing/*.md`).

Each hit was classified as follows:

- **Customer-facing:** the name a user, buyer or installer sees.
- **Technical/internal:** identifiers that code, data, sessions, deployment or tests depend on.
- **Historical/archive:** dated documents that describe the past.

## 2. Changed files (customer-facing)

| File | Change |
|---|---|
| `src/app/layout.tsx` | Browser title `COAVEX` / `%s · COAVEX`, `applicationName: "COAVEX"` |
| `public/manifest.webmanifest` | PWA `name` and `short_name` → `COAVEX` (install metadata) |
| `src/lib/i18n/dictionary.ts` | `app.name` → `COAVEX` |
| `src/components/brand.tsx` | Wordmark `Coa` + lime `vex` (rendered uppercase: COA**VEX**), `BrandMark` accessible name `COAVEX`, comments |
| `src/components/coach-shell.tsx` | Mobile logo link `aria-label="COAVEX"` |
| `src/app/login/page.tsx` | Brand section `aria-label="COAVEX"` (the visible name comes from the Wordmark) |
| `package.json` | `description` starts with `COAVEX —` (release/package label) |
| `README.md` | Title and product mentions → COAVEX, plus a rename note that lists the preserved technical ids |
| `.env.example`, `.env` (local, gitignored) | Comment text "Without a key COAVEX uses…" |
| `prisma/schema.prisma`, `prisma/schema.postgres.prisma` | Header comment only (no schema change) |
| `prisma/seed.ts` | Console line `Seeding COAVEX…` |

**Merged together with the rename:** 91 translation keys (FR/EN/AR) that the "Forge" redesign left un-merged in `dictionary.ts`, because the session running that redesign had stopped. Without them the new screens displayed raw keys. They were recovered from the redesign agents' own output, plus 4 keys written for texts that had none (`client.coach`, `common.days28`, `program.weeksShort`, `sig.CHECKIN_OVERDUE.title`). One of them (`settings.ai.off`) named the product; it now says COAVEX. These are strings for UI already on disk. No feature was added.

**Removed:** leftover temporary scripts from the redesign agents (`scripts/_tmp_*`). They were never part of the app.

## 3. Marketing system (workspace `marketing/`)

The brief refers to `marketing_system/products/*.mjs`. The real path in this workspace is `marketing/_system/products/*.mjs`.

| File | Change |
|---|---|
| `marketing/_system/products/3-coachos.mjs` → **`3-coavex.mjs`** | `name: 'COAVEX'`, `folder: 'COAVEX'`, the 15 copy mentions → COAVEX. Two new FACT lines: (1) the brand fact, (2) a limit: the live demo `coach-os-wine.vercel.app` still shows CoachOS until the COAVEX build is redeployed, and the `@coachos.demo` logins are kept technical ids. `code: 'KOA'` and asset ids `P-KOA-…` are unchanged (technical ids). |
| `marketing/_system/build.mjs` | Product list line: `**COAVEX** (ex-CoachOS)` |
| `marketing/_system/contacts.mjs` | Comment "canal de contact COAVEX non défini" (the value stays `null` = blocked) |
| `marketing/_system/README.md` | Source list: `3-coavex.mjs` (COAVEX, ex-CoachOS) |
| `marketing/MASTER-MARKETING-REPORT.md` (hand-written) | 12 × CoachOS → COAVEX; first mention "COAVEX (ex-CoachOS, renommé le 2026-09-30)" |

**Regenerated:** `node marketing/_system/build.mjs` → `OK — 4 produits, 56 assets, 22 captures manquantes, 18 vidéos`. The outputs are now `marketing/COAVEX/**`, `BRAND-SYSTEM-COAVEX.md` and `SALES-KIT-COAVEX.md`, plus every cross-product file (ASSET-MATRIX, PRODUCTION-MANIFEST.csv, PRODUCT-AUDIT…).

**Stale generated outputs removed:** `marketing/COACH-OS/` (19 files), `BRAND-SYSTEM-COACH-OS.md` and `SALES-KIT-COACH-OS.md`. Their file lists matched the regenerated COAVEX set one for one.

**Validation unchanged:** assets that point to a missing real screen still read `MISSING REAL SCREEN: KOA-MS-0x` and stay `blocked-missing-screen`. No screen was created or faked.

The Vetocare → VEYTIX and Hanout rename sessions ran on the same marketing system at the same time. I edited only the CoachOS lines and coordinated with them by message before running each build.

## 4. Technical identifiers intentionally preserved

| Identifier | Where | Why kept |
|---|---|---|
| Folder `coach-os/`, package name `coach-os` | repo, `package.json` | Paths used by scripts, the other sessions and deployment |
| Cookie `coachos_session` | `src/server/auth/session.ts`, `src/middleware.ts` | Renaming it logs out every signed-in user |
| `localStorage` keys `coachos:theme`, `coachos:recent-clients` | theme toggle, layout pre-paint script, command palette | Renaming them resets users' saved preferences |
| Window events `coachos:toast`, `coachos:open-palette` | toast, palette, shell | Internal event bus |
| Env `COACHOS_DEMO_DB`, temp file `coachos-demo.db`, default secret `coachos-demo-mode-insecure-secret` | `src/server/db.ts`, `src/server/auth/stateless.ts`, `scripts/run-e2e.mjs` | Deployment config and signed-session compatibility |
| Postgres `schema=coachos` | `.env.example`, README | Database schema name |
| Demo logins `*@coachos.demo` | seed, login page demo box, e2e, marketing copy | Real credentials of the seeded data and the live demo; changing them breaks logins until reseed and redeploy |
| Log prefix `[coachos]` | `src/app/error.tsx` | Server log tag, not shown to users |
| Vercel project `coach-os`, URL `coach-os-wine.vercel.app` | deployment | Existing public URL; no COAVEX domain exists |
| Marketing product code `KOA`, asset ids `P-KOA-…`, screen ids `KOA-MS-0x` | `marketing/_system` | Referenced by the manifest and capture tasks |

## 5. Intentionally unchanged (historical/archive and other owners)

- `docs/00-AUDIT.md`, `docs/01-UX-AUDIT.md`, `docs/02-FORGE-DESIGN.md`: dated records of what was done under the old name.
- `e2e-shots/_*.log`: old run logs.
- `coach-os/marketing/capture-forge.mjs`, `shots-2026-09-30/`, `SCREENS-2026-09-30.md`: owned by the marketing capture session. It was told the rename is built so it can re-capture; I did not edit them.
- `hanout-pos/marketing/_archive/**` and other archives: not touched.
- `node_modules/.prisma/client/*`: generated copy of the schema comment. It refreshes on the next `prisma generate`, which was blocked during this session because another session's server held the query-engine DLL.

## 6. QA results (2026-09-30)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx vitest run` | 46/46 pass |
| `npm run db:seed:snapshot` | pass (14 clients · 46 signals · 35 actions) |
| Production build | `npx next build` pass ("Compiled successfully"). `npm run build` first failed at `prisma generate` with an EPERM on the query-engine DLL, which was locked by another session's running `next start`. The Prisma client was already generated and only a schema comment changed, so the build ran without regeneration. |
| Full e2e (`PORT=3217 node scripts/run-e2e.mjs`) | **E2E OK**: 75 screenshots, coach desktop/tablet/mobile + client app, including photos, workout mode, review and messages |
| Branding check (real browser) | Login title `Connexion · COAVEX`, app title `COAVEX`, manifest `COAVEX / COAVEX`, wordmark COA**VEX** on login and sidebar (`e2e-shots/coavex-login.png`, `coavex-shell.png`) |
| Marketing build | `OK — 4 produits, 56 assets, 22 captures manquantes, 18 vidéos` |
| Old name in build output | `grep -r CoachOS .next/static .next/server`: **0 matches** |
| Old name in sources | Only the README rename note, which is intentional |

An earlier e2e attempt failed on "slider moves with the keyboard". It was running against the other session's server on port 3210, not this build. The rerun on a dedicated port is green.

## 7. Remaining references to "CoachOS" and why

- `README.md` rename note: explains the former name.
- `docs/00-AUDIT.md`, `01-UX-AUDIT.md`, `02-FORGE-DESIGN.md`: historical.
- `marketing/_system/products/3-coavex.mjs`, `build.mjs`, `README.md`, `MASTER-MARKETING-REPORT.md`, `PRODUCT-AUDIT.md` (generated): "ex-CoachOS" markers and the FACT that the live demo still shows the old name.
- `coach-os/marketing/capture-forge.mjs`: owned by the capture session.
- Lowercase `coachos` technical identifiers listed in §4.

## 8. Not done (outside this brief)

- **Live demo not redeployed.** `coach-os-wine.vercel.app` still shows CoachOS (and the pre-Forge skin) until the next `vercel deploy --prod`. The marketing source states this as a FACT.
- Marketing captures must be retaken with the COAVEX build (capture session informed).
