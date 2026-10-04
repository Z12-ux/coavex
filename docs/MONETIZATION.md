# COAVEX — Monetization plan

## Model: tiered subscription + metered AI + transactional loop

| Tier | Price | Limits | For |
|---|---|---|---|
| Solo | $19 / month | 1 coach, 30 clients, 100 AI drafts / month included | independent coaches |
| Studio | $59 / month | 5 coaches, 150 clients, 500 AI drafts, roles (owner / admin / coach / assistant) | studios |
| Gym | $199 / month | unlimited coaches, 1 000 clients, 2 500 AI drafts, SSO, audit export, priority support | gyms |
| Enterprise | custom | multi-location, data residency, SLA | chains |

- **Usage-based AI metering.** AI drafts, check-in summaries and weekly-review generation are counted per organization
  (fingerprinted intelligence rows and events already exist, so metering is a query, not a new system). Overage:
  $0.05 per draft, billed monthly. AI cost per draft ≈ $0.01 → AI is gross-margin positive at every tier.
- **Transactional loop (roadmap, next quarter).** Client subscription payments collected through the platform
  (Stripe Connect), 1 % platform fee. The Business view already models subscriptions, MRR and overdue payments, so the fee
  attaches to an existing workflow instead of a new one.
- **Annual billing:** two months free (cash up front, better retention).
- **Expansion revenue:** client seats beyond the tier ($0.50 / client / month), extra coach seats ($9 / month).

## Unit economics (assumptions to validate with the first 20 paying organizations)
- Hosting + database per Studio organization ≈ $1.5 / month; AI at full quota ≈ $5 / month → gross margin ≈ 85–90 %.
- Target: 300 paying organizations in 12 months (mix 60 % Solo, 35 % Studio, 5 % Gym) → MRR ≈ $12 600.
- Acquisition: coach communities and content in FR / AR, 14-day Solo trial, referral (one month free per referred studio).
- Retention lever: the weekly review and the attention queue are habit-forming (daily use). The metric to watch is
  *weekly reviews approved per coach per week*.

## Why recurring revenue is structural
Signals, actions and momentum history accumulate per client. The longer an organization stays, the more valuable its
history and the higher the switching cost. The product is used every morning (Today), every week (Weekly review) and
every billing cycle (Business), which anchors three recurring touchpoints.

## Pricing guardrails
- No feature is paywalled that affects client safety (missed-session reasons, recovery signals are in every tier).
- AI is optional at every tier: without a key, the rule-based composer runs and says so in the UI.
- Export is always available (no data hostage).
