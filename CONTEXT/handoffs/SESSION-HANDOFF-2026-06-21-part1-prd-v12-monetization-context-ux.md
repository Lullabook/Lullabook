# Session Handoff — 2026-06-21: /part1 PRD v12 (monetization + context engine + UX)

> Planning-only. No application code changed. Pointer map — read the artifacts, don't
> re-derive. This wave is **prioritized ahead of the iOS HITL verification** (PRD v10/v11).

## What happened

Ran `/part1` on a large new effort with heavy grilling + two Haiku competitor/UX research
subagents. Produced a single "release-grade" wave: **PRD v12**, **two new ADRs**, supersede
notes on three existing ADRs, **11 issues (89–99)**, and CONTEXT.md glossary updates.

## Locked decisions (the grill)

**Pillar A — Monetization (ADR-0023; supersedes ADR-0009 + parts of ADR-0016; updates ADR-0008):**
- **No free tier.** Entry = **7-day trial of Normal**, card up front = **VPC**. Pre-baked
  **baby-free demo Story** delivers the pre-card aha (the baby's likeness is the upgrade).
- **Three paid tiers:** Basic $8 (4 stories/mo, 2 members, illustrated) · Normal $15 (8/mo,
  4 members, +narration+voice) · Plus $25 (20/mo, ∞ members, +video [2 incl.] +custom style
  [1 train incl.]).
- **Lever = combination** (story cap + member cap + capability gates). Caps are **generous
  ceilings**; profit rests on **breakage (~3 stories/mo avg)** + **Apple 15% Small Business
  rate from day 1**.
- **Credit-metered overage** (per-Household ledger): video beyond 2/mo, custom-style train
  beyond 1/mo, re-roll overage. **Failure refunds the credit; never charge a failed gen.**
- **Custom art style = trained Style LoRA** (durable pipeline like persona LoRA).
- RevenueCat Apple IAP (ADR-0018).

**Pillar B — Story Context Engine (ADR-0022; supersedes ADR-0019):**
- Deterministic rule-based selector; inputs = significant Moments (always) + ordinary
  (since last Story) + roster cast + age/Firsts + past-Story summary + photo vision-text.
  Bounded ≤~2000 tokens; **no extra LLM call**; LLM-ranking deferred behind a seam.

**Pillar C — UX:**
- **5-tab IA** (Home/Stories/Create/Family/Settings), retire flat "More."
- **Baby-hero Home dashboard** + context-engine **story nudge** + continue-reading +
  this-week/streak + family-activity cards.
- **First-open demo aha** before card; Day-0 paywall after, annual-default.

**Packaging:** one PRD, ADRs first, build **B → A → C**, one handoff.

## Invariants (PASS/FAIL contract — targets for /part2 red-team)

- **Latency:** context assembly <200ms / ≤~2000 tokens; entitlement check <300ms (never
  blocks render); style-LoRA train <10min async; Home p95 <1s.
- **Failure:** RevenueCat down → cached entitlement, degrade, retry, no crash; style/video
  fail → fallback + **credit refund**; cap/credit exhaustion → structured state, **no charge
  for failed gen** (idempotent); empty data source → degrade to roster+age.
- **Security:** **no child likeness without card-on-file VPC** (cornerstone); tier/cap/credit
  enforced **server-side (403) + idempotent**; context engine per-Family RLS, never crosses
  Babies, write-only vision→text only; style+member LoRAs Family-scoped + hard-delete-purged;
  entitlements/credits not client-escalatable; no secrets committed.

## Artifacts written

- ADRs: `CONTEXT/docs/adr/0022-story-context-engine.md`,
  `…/0023-three-tier-monetization-and-credits.md`; supersede/update notes on 0008, 0009,
  0016, 0019.
- PRD: `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`.
- Issues: `CONTEXT/issues/89`–`99` (each with Verification-command + Blocked-by).
- Glossary: CONTEXT.md — Tier, Trial, Story cap, Credit, Custom art style, Story Context Engine.

## Issue map (build order B → A → C)

| # | Track | Issue | Blocked by |
|---|---|---|---|
| 89 | B | Story Context Engine core (ADR-0022) | — (subsumes 54) |
| 90 | B | Past-Story continuity summary | 89 |
| 91 | A | Tier & entitlement model (ADR-0023) | — |
| 92 | A | RevenueCat IAP + trial/VPC | 91 |
| 93 | A | Story/member cap enforcement | 91 |
| 94 | A | Credit ledger + metering | 91 |
| 95 | A | Custom-style Style-LoRA pipeline | 91, 94 |
| 96 | C | 5-tab IA (retire "More") | — |
| 97 | C | Baby-hero Home dashboard + nudge | 89, 96 |
| 98 | C | First-open demo aha + paywall | 91, 92, 96 |
| 99 | C | Paywall UI + tier badges | 91, 92 |

## Research inputs (2026-06-21 Haiku agents)

- Pricing: **$15 mid is market-leading** (StoryBee $15 = category's most-popular tier);
  **custom art styles are a market gap**; competitors advertise 40–90 stories/mo but rely on
  breakage + cheaper COGS.
- UX: health-app dashboard inversion confirmed; IA = Home/Library/Create/Family/Settings;
  hero = book preview + tap-to-read; the make-or-break is **first narrated book <90s before
  paywall** → demo aha.

## Not done / follow-ups

- GH issues for 89–99 not filed (auto-mode blocks external publish); canonical tracker is the
  markdown files. File via `gh issue create … --label ready-for-agent` if wanted.
- **iOS HITL verification (PRD v10/v11, issue 88 gate) is now second priority** behind this wave.
- `/part2` starts at **issue 89** (lowest-numbered unblocked).

## Suggested skills
- `/part2` — issue **89** (context engine core), then follow the B → A → C order.
