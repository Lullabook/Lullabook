# 0023 — Three-tier monetization, trial-as-entry, credit-metered overage

- Status: Accepted (2026-06-21)
- Supersedes: [ADR-0009](0009-subscription-monetization.md) (single paid tier, Personas
  as the sole lever) and the gate-line framing of
  [ADR-0016](0016-character-tier-two-tier-consent.md).
- Updates: [ADR-0008](0008-verifiable-parental-consent.md) — the VPC mechanism is now
  **any paid entry, including the free trial** (card-on-file), not "an active paid
  subscription" specifically.
- Depends on: [ADR-0018](0018-native-ios-app-iap-and-email-plus-vpc.md) (Apple IAP via
  RevenueCat), [ADR-0002](0002-per-persona-lora.md), [ADR-0012](0012-illustration-pipeline-style-bible.md).

## Context

The 2026-06-16 grill recorded a direction of "Free + one paid tier + credits," with
illustrations becoming free. The 2026-06-21 grill **overrode it**: competitor research
(StoryBee's $15 tier is the category's most-popular) and unit-economics math reshaped
the model. Two hard constraints drove the decision:

1. **Consent law.** ADR-0008/0009 made the paid subscription the Verifiable Parental
   Consent gate — "no free tier touches a child's photos." A free tier that puts the
   **baby's likeness** in stories would create a child's biometric likeness with no
   card-on-file VPC: a COPPA-class exposure. So a free tier *with the baby* is not
   legally viable.
2. **Margin.** Each illustrated Story carries real COGS (~$1.20: Claude text + ~6 fal
   images; +$0.20 narration; +~$2.10 for a video book). At full cap usage, generous
   caps **lose money** at Apple's 30% cut. Profit depends on breakage + Apple's 15%
   Small Business rate + metering the cost-heavy features.

## Decision

**No free tier. A 7-day free trial of the Normal tier (card required up front = VPC)
is the entry.** A pre-baked **demo Story** delivers the first-open "aha" before the
card; the **baby's likeness is the upgrade** — no child photo is uploaded without a
card-on-file.

**Three paid tiers** (US baseline; per-storefront Asia pricing per ADR-0015):

| | Basic $8 | Normal $15 | Plus $25 |
|---|---|---|---|
| Stories / month (cap) | 4 | 8 | 20 |
| Family members (likeness) | 2 | 4 | unlimited (fair use) |
| Illustrated | yes | yes | yes |
| AI narration + real-voice weave | — | yes | yes |
| Video pages | — | — | **2 included/mo, then credits** |
| Custom art style (trained Style LoRA) | — | — | **1 train/mo included, then credits** |

**The lever is a combination:** a monthly **Story cap** (margin guard), a
**Family-member cap** (guards the biggest one-time cost — each member is a LoRA), and
**capability gates** (narration / video / custom style). Caps are **generous ceilings**;
profitability rests on **breakage** (average ≈3 Stories/mo) plus enrolling in **Apple's
15% Small Business Program from day one** (it flips Normal from −$0.70 to +$0.55 at full
usage).

**Cost-heavy features are credit-metered, never "unlimited within the cap":** video
pages beyond the included allotment and custom-style **trainings** beyond the included
one draw from a **credit ledger**. Credits also cover re-roll overage (per ADR-0004).
A **failed** video render or style train **refunds the credit** and never blocks the
Story (money-safety, [ADR-0011](0011-backend-architecture.md) / issue 16).

**Custom art style = a trained Style LoRA** bound to the Household (a durable training
pipeline like the persona LoRA), used as that book's Style Bible; on train failure the
Story falls back to a default Style Bible.

## Why (the trade-off)

- A **trial-as-entry** keeps ADR-0008 intact trivially (card = VPC) and converts ~5×
  better than freemium per research, at the cost of the free acquisition hook (replaced
  by the demo aha).
- **Three tiers** give a price ladder ($8 budget / $15 anchor / $25 keepsake-premium)
  that matches market precedent without a margin-bleeding "unlimited."
- **Metering the expensive features** is the only way the generous caps survive; it
  also revives ADR-0009's credit-overage idea inside the new model.

## Consequences

- Entitlements (tier, caps, credit balance) are **server-side source of truth**,
  validated from the RevenueCat entitlement; the client UI gate is UX only. Endpoints
  for gated features **reject unentitled calls with 403**, idempotently.
- Story/credit caps reset **monthly**; a per-Household **credit ledger** is introduced.
- The demo Story is a **pre-baked, baby-free** artifact (no child likeness) so it can
  run pre-card.
- Founding-Family launch offer + annual-default paywall (per
  `planning/pricing-and-features-2026-06-13.md`) carry forward.

## Considered Options

- **Keep a free tier (fictional-only, no baby likeness)** — legally clean, but the user
  chose trial-as-entry for conversion; revisit if acquisition stalls.
- **Capability gates only / family-member cap only** — rejected: neither bounds
  per-Story image COGS, so heavy users bleed margin.
- **Raise prices to cover full usage ($19/$35)** — rejected: above the $15 market
  anchor, weaker conversion.
