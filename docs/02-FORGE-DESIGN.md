# CoachOS "Forge" design — brief and rules

Reference supplied by the product owner: a "Cyberpunk Fitness App UI 2026" concept (FitForge), four phone screens:

1. **Welcome** — near-black screen, glowing lime logo mark, wide letter-spaced wordmark, tagline *BUILT. TRAINED. UNSTOPPABLE.*, athlete silhouette with lime rim light, one lime CTA *TRAIN YOUR LIMITS ›*, small "already a member? log in".
2. **Dashboard** — *WELCOME BACK,* (small) over *WARRIOR* (huge condensed uppercase); *WEEKLY PROGRESS* card = big lime ring "67 %" with glow + three stat rows with icons (workouts, calories, time); *TODAY'S PLAN* card = title + meta + body figure with the trained muscles lit in lime + full-width lime *START WORKOUT ›*; *FEATURED PROGRAMS* horizontal cards; bottom nav with the active icon in lime.
3. **Workout** — back arrow + *WORKOUT* kicker, huge *BACK & BICEPS* title, level badge, meta rows (duration, exercises, kcal), segmented *OVERVIEW / EXERCISES*, *MUSCLES TARGETED* front + back figures with lime muscles and a legend, *START WORKOUT* lime CTA, *SAVE FOR LATER* outline.
4. **Exercise** — *PULL UPS* title + badge, big figure, three bordered tiles *SETS 4 · REPS 8-12 · REST 60s*, *HOW TO PERFORM* text, big lime *LOG SET ✓*.

Reference image (read it): `C:\Users\User\AppData\Local\Temp\claude\c--Users-User-Desktop-Kimi-Agent---------\ce8b6e5e-f41a-44bc-9e2d-fc30868d120f\images\1.jpg`

## What we take, what we don't

Take: near-black green-cast surfaces, ONE neon-lime accent, condensed uppercase display type for titles and numbers, small letter-spaced uppercase kickers, glowing progress rings, muscle maps, bordered stat tiles, full-width neon CTA with an arrow chip, lime active state in navigation.
Don't take: glow everywhere, lime on body text, decorative noise that hides data, anything that lowers contrast below WCAG AA, marketing copy in a work tool. CoachOS stays an operating system: dense, explainable, fast. Forge is its skin, not a new product.

## Tokens (src/app/globals.css — owned by the lead, do not edit)

Dark "Forge" is the default on `:root`; light variant on `:root[data-theme="light"]`. The class `.forge` re-applies the dark set to a subtree (hero cards, login) so brand moments stay dark in light mode.

| Token (Tailwind name) | Use |
|---|---|
| `bg`, `surface`, `surface-2`, `surface-3` | page, card, inset/input, deepest inset/track |
| `border`, `border-strong` | hairlines, inputs/tiles |
| `ink`, `ink-2`, `muted`, `muted-2` | text: primary → faint. **Text is always ink/muted, never the accent colour for long text** |
| `accent` (#c4f538 lime), `accent-ink`, `accent-soft` | primary action, progress, active state, key numbers |
| `good`, `warn`, `bad`, `info` + `-soft` | semantics only (never decorative) |

Utilities: `.glow` (neon halo — primary CTA / active), `.glow-sm`, `.text-glow` (the one hero word), `.ring-glow` (on SVG arcs, uses `currentColor`), `.neon-edge` (lime-tinted border), `.bg-grid` (subtle lime grid texture), `.hero` (dark gradient + lime edge — use through `HeroCard`), `.neon-pulse` (one live indicator max).
Type: `.t-display` (condensed 800 uppercase, 34/42 px), `.t-title` (condensed 700 uppercase 26 px), `.t-kicker` / `.t-section` (11.5 px uppercase tracked, muted), `.t-metric` / `.t-metric-lg` (condensed numerals), `.t-caption`, `.t-meta`, `.t-label`, `.t-card`, `font-display` (condensed family).
Fonts: Barlow (body) + Barlow Condensed (display) via next/font. Arabic falls back to Noto Sans Arabic / system; **RTL removes all letter-spacing globally** — still use logical utilities (`ms-/me-/ps-/pe-/start-/end-`, `rtl:rotate-180` on arrows).

## Shared components (owned by the lead unless stated)

- `ui.tsx`: `Button`/`LinkButton` variants `primary` (lime, semibold), **`neon`** (uppercase + glow — THE CTA, one per screen), `secondary`, `outline`, `ghost`, `danger`; `CtaArrow` (put last inside a `neon` button with `justify-between`); `Panel` (rounded-lg), `PanelHeader` (uppercase tracked title), `PageHeader` (condensed uppercase title), `Tabs` (uppercase, lime active), `Badge`, `Avatar`, `Field`, `inputClass`/`selectClass`/`textareaClass` (surface-2 insets), `Scale`, `Row`, `EmptyState`.
- `charts.tsx`: `RingGauge` (glow on by default), `Sparkline` (`area` for gradient fill), `BarStrip`, `ScoreBar`, `Bars`, `DayStrip` (done = lime).
- `stat-card.tsx`: `StatCard`, `HeroCard` (always dark `.forge .hero`), `AvatarRing`.
- `theme-toggle.tsx`: `<ThemeToggle labels={{ toLight: t(locale,"theme.toLight"), toDark: t(locale,"theme.toDark") }} withLabel? />`.
- `brand.tsx` (brand agent): `<BrandMark size={32} />`, `<Wordmark sub="…" />`.
- `muscle-map.tsx` (muscle-map agent): `<MuscleMap groups={["LEGS","CORE"]} view="front"|"back"|"both" height={140} label="…" />`, `muscleGroupsOf(exercises)`, `MUSCLE_GROUPS`, type `MuscleGroup`. Groups = `Exercise.muscleGroup` values: CHEST, BACK, LEGS, SHOULDERS, ARMS, CORE, FULL_BODY, CARDIO. Existing i18n keys `muscle.<GROUP>` give their names (FR/EN/AR).

## Rules every screen follows

1. Tokens only. No hex, no `bg-white`/`text-white`/`text-black` in app surfaces (allowed only as overlays on photos, and inside SVG art). Anything that must stay dark in light mode goes inside `.forge`.
2. One `neon` CTA per screen (the next thing to do). Everything else `primary`/`outline`/`ghost`.
3. Glow only on: the neon CTA, progress rings/arcs, the active nav item, the one hero word. Nowhere else.
4. Numbers that matter use `font-display` / `.t-metric`; titles use `.t-display` / `.t-title` / `PageHeader`; card titles use `PanelHeader` or `.t-kicker`.
5. Contrast AA: body text `ink`/`ink-2` on `surface`; `muted` only for secondary text ≥ 12 px. Lime text only on dark surfaces and only for short labels/numbers. On lime backgrounds use `accent-ink`.
6. Touch targets ≥ 44 px, visible focus (`:focus-visible` already lime), keyboard paths unchanged, `prefers-reduced-motion` respected (global rule exists — don't add JS animations that ignore it).
7. Light theme must still work: never assume dark in a component — use tokens; brand-dark areas use `.forge`.
8. Data first: every restyled element keeps the same data, links and actions. Do not remove information to make it prettier.

## Do-not-break contract (end-to-end tests)

`scripts/e2e.mjs` drives the app. Read it before editing a screen. Preserve every selector it uses: link `href` patterns (`/clients/{id}/train/{sessionId}`, `/app/workout/{id}`, `/messages/{id}`), `aria-label`s (`Actions rapides`, `Rechercher`…), `name`/`value` attributes (`button[value="DONE"]`, `button[value="APPROVED"]`, `input[name="sleepHours"]`, `input[name="energy"][value="4"] + span`, `form select[name="reason"]`…), headings (`main h1`/`main h2`, login `form h1`), `[role="timer"]`, `[role="status"]`, `form[data-busy]`, `ul[aria-label="Avant / Après"] li`, `[role="slider"]`, the text of buttons/links it clicks (matching is case-insensitive, so CSS `uppercase` is fine; changing the words is not). In workout mode, `button[aria-pressed="false"]` must match **only** the set-check buttons (do not add other `aria-pressed` controls on that page) and exercise headers stay `main ol > li > button[aria-expanded]`.

## Working rules for the parallel agents

- Edit only the files you own (listed in your brief). If a shared file needs a change, describe it in `sharedRequests` — the lead applies it.
- Do not edit `src/lib/i18n/dictionary.ts`. Use new keys with `t(locale, "your.key")` and return them (fr/en/ar) in `i18n`; the lead merges them. Reuse existing keys when they fit (grep the dictionary).
- Verify with `npx tsc --noEmit --incremental false` only. Never run `next build`, `next dev/start`, `npm run build`, the e2e scripts or any prisma/db command (shared `.next` and database).
- Temporary render scripts go in `scripts/_tmp_<you>_*` and must be deleted before you finish.
