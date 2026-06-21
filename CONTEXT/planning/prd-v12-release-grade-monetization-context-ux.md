# PRD v12 — Release-grade wave: 3-tier monetization + Story Context Engine + Home redesign

> Status: ready for agent. Planning artifact from `/part1` (2026-06-21).
> **Priority:** ahead of the iOS HITL verification wave (PRD v10/v11) per the product
> owner. **Opens with ADRs, not code** — ADR-0022 + ADR-0023 (and the ADR-0008/0009/0016
> updates) are written first; this PRD synthesizes the grilled decisions and the locked
> invariants. Research inputs: two 2026-06-21 Haiku competitor/UX agent runs +
> `pricing-and-features-2026-06-13.md`.

## Why this wave

The app reads like a settings page, not a product someone falls for on first open
(flat Home + a catch-all "More" tab — confirmed live on the Simulator). Three gaps
keep it pre-release: (1) **no real monetization** (the subscription gate is dev-forced),
(2) **generation under-uses the data we already hold** (only Moments feed the Prompt,
per ADR-0019), and (3) **the UX doesn't earn trust on first open.** This wave closes all
three as one coherent "make it feel released" push.

## Locked decisions (from the grill)

### Pillar A — Monetization (ADR-0023; supersedes ADR-0009, parts of ADR-0016; updates ADR-0008)
- **No free tier.** Entry is a **7-day free trial of Normal** (card up front = VPC). A
  **pre-baked, baby-free demo Story** delivers the first-open aha before the card; the
  baby's likeness is the upgrade.
- **Three paid tiers** (US baseline; Asia per-storefront per ADR-0015):

  | | Basic $8 | Normal $15 | Plus $25 |
  |---|---|---|---|
  | Stories/mo (cap) | 4 | 8 | 20 |
  | Family members | 2 | 4 | unlimited (fair use) |
  | Illustrated | yes | yes | yes |
  | Narration + real-voice weave | — | yes | yes |
  | Video pages | — | — | 2 incl./mo, then credits |
  | Custom art style (Style LoRA) | — | — | 1 train/mo incl., then credits |

- **Lever = combination:** monthly Story cap (margin guard) + Family-member cap
  (biggest-cost guard) + capability gates. Caps are **generous ceilings**; profit rests
  on **breakage (avg ≈3 stories/mo)** + **Apple 15% Small Business Program from day 1**.
- **Credit-metered overage:** video pages beyond 2/mo and custom-style trainings beyond
  1/mo draw from a per-Household **credit ledger** (also covers re-roll overage). A
  **failed** video/train **refunds the credit** and never blocks the Story.
- **Custom art style = a trained Style LoRA** (durable pipeline like the persona LoRA);
  train failure → fall back to default Style Bible.
- Platform: **Apple IAP via RevenueCat** (ADR-0018). Founding-Family offer + annual-default
  paywall carry forward.

### Pillar B — Story Context Engine (ADR-0022; supersedes ADR-0019)
- A **deterministic, rule-based selector** assembles a bounded **story context set** and
  feeds it to the Prompt builder (distinct from the Brief). Inputs: significant Moments
  (always), ordinary Moments (since last Story), roster cast, age/Firsts, a **past-Story
  summary** (continuity + anti-repeat), and moment-photo **vision-text** (ADR-0021, never
  raw images). Bound by token budget (~2000) + newest-N; significant wins on trim;
  watermark advances on success only. **No extra LLM call**; LLM-ranking is a deferred v2
  behind the seam.

### Pillar C — UX redesign (Home dashboard + IA)
- **5-tab IA:** Home / Stories / Create / Family / Settings — retires the flat "More."
- **Home = baby/World hero** + one primary CTA, plus glanceable cards: **Continue
  reading**, a **context-engine Story nudge** (surfaces Pillar B — "Maya's first steps —
  make a story?"), **this-week/streak**, and **Family activity**. Detail lives in the tabs.
- **First-open aha:** pre-baked demo Story before the card; **Day-0 paywall after the
  aha**, annual-default.

### Packaging & order
- **One PRD, ADRs first, build order B → A → C.** Issues 89–99, one handoff.

## Invariants (acceptance constraints — the PASS/FAIL contract)

### Latency / performance
- Context assembly adds **<200ms** to prompt-build (deterministic; no LLM) and is bounded
  **≤~2000 context tokens**.
- Entitlement check **<300ms** (cached from RevenueCat); **never blocks UI render**
  (optimistic, reconciled).
- Custom-style LoRA train: `generating → ready` **<10min**, async with status.
- Home dashboard (incl. the nudge): **p95 <1s** on local `dev:paid`.

### Failure modes
- **RevenueCat down / receipt validation fails** → keep last-known cached entitlement,
  degrade gracefully, retry; **no crash / unhandled rejection**; surface only if it
  can't be confirmed.
- **Style-LoRA train fails** → fall back to a default Style Bible **and refund the
  credit**; the Story is never blocked.
- **Video page fails** → page falls back to its static illustration (recoverable hole,
  per PRD v10) **and refunds the credit**.
- **Cap / credit exhaustion** → a clear "N/N used, resets on DATE / upgrade" or "out of
  credits" state; **never a dead end, never a charge for a failed generation**
  (idempotent — ADR-0011 / issue 16).
- **Empty/missing data source** (no Moments, no past Story) → engine degrades to
  roster + age; a malformed Moment is skipped, not fatal.

### Security / permission boundaries
- **No child likeness without a card-on-file VPC** (cornerstone — ADR-0008 as updated):
  trial requires a payment method; no anonymous baby-photo upload; the demo is baby-free.
- **Tier / cap / credit limits enforced server-side** (403 on unentitled calls, not just
  hidden buttons) and **idempotently** — replays can't bypass a cap or double-spend a credit.
- Context engine honors **per-Family RLS** and **never crosses Babies**; uses **write-only
  vision→text** (ADR-0021) — raw photos never enter the Prompt or any output.
- Custom-style LoRA + family-member LoRAs are **Family-scoped sensitive blobs**;
  **hard-delete purges them** (ADR-0007).
- Entitlements/credits can't be escalated client-side — the validated RevenueCat
  entitlement + server credit ledger are the source of truth.
- **No secrets committed** (RevenueCat/fal keys); env-var names only.

## Scope

**In:** ADR-0022, ADR-0023, ADR-0008/0009/0016 updates; the context engine; the
tier/entitlement model + RevenueCat IAP + trial; server-side caps + credit ledger +
metering; the custom-style Style-LoRA pipeline; the 5-tab IA; the baby-hero Home
dashboard + context nudge; the first-open demo aha + paywall.

**Out:** voice cloning; long-form video; LLM-ranking context v2 (seam only);
printed-hardcover upsell; podcast export; the iOS HITL verification (PRD v10/v11 — runs
after this wave); re-litigating child-safety infra (reused/extended).

## Testing approach
- Test at the service/use-case seam with provider adapters faked (RevenueCat, fal LoRA,
  Anthropic). Integration-test RLS isolation, hard-delete purge of style/member LoRAs,
  and idempotent cap/credit enforcement. The context engine is unit-tested against its
  explicit selection contract. UI gating is tested, but the **server 403** is the real
  boundary under test.

## Issues
See `CONTEXT/issues/89`–`99`. Dependency-ordered, build **B → A → C**; start at 89.
