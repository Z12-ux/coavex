# CoachOS — UI/UX audit and redesign pass (2026-09-28)

Audit source: the running product (production build, Playwright screenshots at 1366 / 820 / 390 px, `e2e-shots/`), not mockups.

## 1. What the audit found

| # | Problem (real product) | Impact for a coach on the gym floor |
|---|---|---|
| 1 | Command center opened on **7 KPI tiles** before the queue; on a phone that is two screens of numbers before the first decision | 3-second test failed on mobile |
| 2 | No task view: nothing said *who is next*, *what is pending*, *what is done* | The coach had to derive today's priorities from the queue |
| 3 | Attention queue was one flat list; urgency only visible per row | Hard to "clear" the queue |
| 4 | Client list = desktop table; on mobile most columns were hidden and the row carried no signal or action | Impossible to understand a client without opening the profile |
| 5 | **No coach workout mode**: the coach could not log a client's sets; the client form used keyboard number inputs (browser step validation even blocked submission for 18.75 kg) | Core gym workflow missing / fragile |
| 6 | No rest timer, no fast set entry (+/-, copy previous, mark done) | Too many taps and typing between sets |
| 7 | No feedback after actions (no toast); double submits possible | Coach could not tell whether "Fait" worked |
| 8 | No contextual quick actions on mobile; the profile's primary actions lived in a desktop header | Message / Session / Check-in / Note needed navigation |
| 9 | Signal cards mixed observation, interpretation and suggestion in the same visual weight | Certainty implied where none existed |
| 10 | Search had no recent clients and the palette was a desktop dialog on phones | Search felt slow on mobile |
| 11 | Generic labels ("Enregistrer", "+") on 12 forms | UX writing not contextual |
| 12 | Leaked i18n keys (`ev.lastActive`, `ev.recovery`) and 12-hour times in a 24-hour locale | Trust |
| 13 | Client profile header not sticky on long mobile pages | Disorientation while scrolling nine tabs |
| 14 | No keyboard shortcuts beyond Ctrl+K; no discoverability | Desktop speed |
| 15 | `loading.tsx` route boundary silently broke server-action UI updates in production (fixed earlier) | Stale screens |

## 2. Design system (what changed)

- **Tokens** (`src/app/globals.css`): semantic colors (light + designed dark), one accent, radii 10/6, two shadows, motion tokens (`--t-fast/med/slow`, `--ease-out/in/spring`), reduced-motion contract.
- **Typography scale**: `.t-display .t-title .t-section .t-card .t-body .t-label .t-caption .t-meta .t-metric`. Nothing below 12 px on mobile; metrics tabular.
- **Primitives** (`src/components/`): `Button`/`LinkButton`, `Badge`, `Avatar`, `Panel`, `Kpi`, `EmptyState`, `Skeleton`, `Field`, `Scale`, `Tabs`, **`Sheet`** (bottom sheet ≤640 px, dialog above), **`Toaster`/`toast()`**, **`Stepper`**, **`RestTimer`**, **`WorkoutMode`**, **`QuickActionsFab`/`QuickActionList`**, `ActionForm` (busy state + success/error toast + refresh + optional confirm).
- **Motion**: `.press` (scale .97, 120 ms), `.enter`/`.enter-stagger` (220 ms, capped), `.pop` for set completion, sheet/toast keyframes; all transform/opacity only; `prefers-reduced-motion` collapses everything.
- **Iconography**: lucide only, 16–20 px, always with a label.

## 3. Navigation and information architecture

- **Mobile bottom bar (coach)**: Today · Clients · Agenda · Messages · Revue (badges for attention, unanswered, pending check-ins). Settings/analytics/business under the top-right "more".
- **Floating quick actions** (phones): Search, Add client, Agenda, Message, Weekly review, Analytics.
- **Workout mode is immersive**: bottom nav and FAB hide; sticky context header + sticky primary action.
- **Keyboard** (desktop): `/` or Ctrl+K palette, `N` new client, `C` clients, `A` agenda, `R` review, `M` messages, `T` today; shown in the sidebar and the palette footer; never while typing or while a dialog is open.

## 4. Screens

- **Today** (`/`): NEXT (who/what/when + *Start workout*) · PENDING (check-ins, unanswered messages, open actions with names) · DONE TODAY · then the **grouped attention queue** (Urgent / Attention / Watch / Good news), each row = who · what happened · next action (tappable) · Done. KPIs are desktop-only. First-run **onboarding checklist** appears while the workspace has no client.
- **Clients** (`/clients`): phones get a scannable list (avatar, name, status, momentum, next session / last check-in, adherence, ⚠ next action, message + open); desktop keeps the dense table. Attention first.
- **Client profile**: sticky identity → goal → status → next action; **contextual action bar** (Message · Workout · Check-in · Note) pinned above the bottom nav on phones, inline on desktop. Training tab gets a NEXT session card with *Start workout*. Landing after a logged workout shows a toast (with PR).
- **Workout mode** (`/clients/[id]/train/[sessionId]` for the coach, `/app/workout/[sessionId]` for the client): one exercise expanded at a time, progress "3/6 exercises · 9/16 sets · 56 %", steppers (+1 rep, ±2.5 kg main lifts / ±1.25 accessories), copy previous set, one-tap set completion that starts the **rest timer** (pause, +30 s, skip, vibration), auto-advance to the next exercise, RPE stepper, shortened flag, note, sticky *Finish · x/y*. Injury/equipment notes surface as warnings.
- **Signals**: Observation / Why it matters / Suggested action labelled explicitly; severity always icon + label.
- **Search**: full-screen on phones, recent clients group, status shown, shortcuts footer.
- **Forms**: contextual verbs everywhere (*Enregistrer la mesure*, *Ajouter la note*, *Créer l'abonnement*, *Créer le client*…), success toasts, destructive confirm on note delete.

## 5. What was deliberately not done

- No new dependencies, no charts added, no gamification, no glass/gradients.
- Dark mode kept as designed tokens (no marketing toggle).
- Swipe gestures skipped: every action is reachable by a visible control (gestures would only duplicate).
- Photo upload UI: done later (see §7 and the Photos tab).

## 6. Verification

`node scripts/run-e2e.mjs` walks coach desktop/tablet/mobile + client mobile, including: Today NEXT card, grouped queue, action done → toast, weekly review, message assistant, Ctrl+K + recent + `N` shortcut, quick-actions sheet, profile action bar, coach workout mode (steppers, timer, finish → completed), client daily log, missed reason, client workout mode, check-in, messages, RBAC redirects. Screenshots in `e2e-shots/`.

## 7. Pass 3 — visual refresh from current fitness-app references (2026-09-29)

Requested reference: a Pinterest search for "coach os app ui/ux" — it returns no pins (even anonymously: *Aucune Épingle trouvée*), so the review used the equivalent Dribbble searches (*fitness coach app*, *personal trainer dashboard*, ~60 shots). Recurring patterns kept, the rest discarded:

| Pattern seen in the references | Applied in CoachOS | Not applied (why) |
|---|---|---|
| Greeting header ("Good morning, Alex") | Coach Today and client Today: `Bonjour, Sami` / `Bonjour, Ahmed 👋` + date caption | — |
| One dark gradient "hero" card for the thing to do now, big white CTA | `HeroCard`: coach NEXT session (with completion ring) and client *Séance du jour* | Full dark theme (kept the calm light system; dark mode already exists) |
| Ring / arc gauges with a big number | `RingGauge`: sessions today, adherence 28 d (profile + client list), habits / daily log / week rings on client Today, workout-mode progress, goal ring around the client avatar | Rainbow multi-ring dashboards |
| Stat cards: number + delta chip (+2 %, −1.5 pts) + tiny sparkline | `StatCard` row on Today (sessions, missed vs previous 7 d, org adherence 14 d vs previous 14 d with 8-week sparkline, clients to handle) — horizontal snap on phones | Vanity metrics without a comparison |
| Week strip (Mon…Sun with done / missed / planned dots) | `DayStrip`: client Today *Ma semaine*, profile stat strip *Cette semaine* | — |
| Soft-coloured macro tiles | Nutrition targets tiles (kcal / P / G / L) | — |
| Area charts with gradient fill | `Sparkline area`: weight curve (client progress, profile weight stat), strength trends | Dual-axis charts |
| Trophy / PR cards | Personal records as cards on client progress | Confetti / badges |
| Rounded 12–16 px surfaces, subtle shadows | `--radius` 12 px, `--radius-lg` 16 px, `shadow-sm` on stat cards | Glassmorphism |

Rules kept from the earlier passes: one accent, text in ink tokens (never the series colour), every number explainable, nothing automatic. New primitives: `src/components/charts.tsx` (`RingGauge`, `DayStrip`, `Sparkline area`), `src/components/stat-card.tsx` (`StatCard`, `HeroCard`, `AvatarRing`), `src/components/client/profile-stats.tsx`. `todayStats` now returns the org adherence trend and deltas.
