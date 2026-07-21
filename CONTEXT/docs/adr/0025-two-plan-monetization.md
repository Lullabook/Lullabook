# 0025 — Two-plan monetization: "Just Us" and "Our Whole Family"

- Status: Accepted (2026-06-22); the R1 Just Us price, Story cap, and Persona assumptions are superseded by [ADR-0028](0028-r1-family-persona-provider-economics.md). The later collaboration-axis decision remains accepted.
- Supersedes: [ADR-0023](0023-three-tier-monetization-and-credits.md) (Basic/Normal/Plus
  three-tier model) — collapses the capability-ladder into a **collaboration axis**.
  Retains 0023's credit-metering, breakage logic, and "entitlement is server-side source
  of truth."
- Updates: [ADR-0008](0008-verifiable-parental-consent.md) — entry remains a card-on-file
  trial (= VPC); the trial is now of the full (Our Whole Family) experience.
- Depends on: [ADR-0018](0018-native-ios-app-iap-and-email-plus-vpc.md) (Apple IAP via
  RevenueCat), [ADR-0024](0024-family-accounts-collaborative-creation.md) (invited Members
  — what the Family plan sells), [ADR-0002](0002-per-persona-lora.md),
  [ADR-0012](0012-illustration-pipeline-style-bible.md).

## Context

ADR-0023's three tiers were keyed on a capability ladder. The product sharpened to "the
Baby's World shared by the real family," which makes **who can participate** the primary
value axis, not feature count. Research (2026-06-22, fanned-out agents; sources cited):

- **Unit economics** (verified against current vendor pricing): a 12-page single-persona
  Story costs **~$0.49** (illustrations ≈80% of it via `fal-ai/flux-lora` @ $0.035/img;
  Claude `claude-sonnet-4-6` text ≈6¢); a per-member **LoRA train is $2 one-time**
  (`fal-ai/flux-lora-fast-training`); **voice is ~free** (recorded-only, no STT/cloning —
  storage only); a **video page is $0.10–0.50** — the single most expensive unit.
- **Market**: budget AI-story apps ~$5/mo (Storybooks.app $4.99), "serious" personalized
  story apps ~$9.99/mo (BedtimeStory.ai), premium photo-to-book $20–30/mo; family-audio
  comparables (Calm/Headspace) $99.99/yr for 6 accounts; a single Wonderbly hardcover is
  $39.99. Capability-expansion premium tiers sustain a 2–3× multiple.
- The codebase **already bills the Household** (`familyId`); RevenueCat `app_user_id` *is*
  the `familyId`. So one payer → many member logins inherit — the **only model that
  survives Apple IAP** (no per-seat across Apple IDs).

## Decision

**Two plans on a collaboration axis. A 7-day card-on-file trial (= VPC) of the full
experience is the entry; annual is pre-selected.**

| | **Just Us** | **Our Whole Family** |
|---|---|---|
| Monthly / Annual | **$9.99 / $79.99** | **$24.99 / $199.99** |
| Who creates Stories | the parent only (Guardian) | **every invited Member** |
| Invited Members | view-only | full Members (record + create) |
| Member-login cap | parent (+ co-parent, view-only) | the whole family (fair use) |
| Family members (Personas / likeness) | up to 3 | fair-use |
| Illustrated Stories | yes | yes |
| Voice messages + narration + lullaby weave | — | **yes** |
| Video pages | — | **credit-metered (2 incl./mo)** |
| Custom art style (Style LoRA) | — | yes (1 train/mo, then credits) |
| Monthly Story cap | 8 | 20 |

**Two new entitlement primitives**, additive to the existing `familyId` subscription: a
**member-login cap** (distinct from the likeness/persona cap, which guards LoRA cost) and
a **per-member create-rights gate** — `requireCanCreate(familyId, memberId)` resolved
server-side from plan + role. Voice + video are **Our-Whole-Family only**: voice is ~free
to serve so it *sells* the tier; video stays **credit-metered** (never unlimited) because
one fully-animated book can exceed a month's price.

**Margin** is protected by **breakage** (generous caps; average usage far below cap),
Apple's **15% Small Business** rate, and **planning compute against the Apple-net annual
price** (~$2/mo cost-to-serve Just Us, ~$3.50/mo Our Whole Family). Two pre-existing gaps
are closed: the monthly **Story cap is now enforced** at generation (today it's computed
but `requireUnderCap` is never called), and the **credit ledger is persisted** (today
in-memory, resets on restart).

## Why (the trade-off)

- A collaboration axis matches the product story (the grandparent voice is the wedge) and
  lets the premium plan command ~2.5× without a margin-bleeding "unlimited."
- Bundling voice+video into Our Whole Family (vs a 4th add-on tier) keeps the choice to
  **two** and makes the higher price feel earned (research: 3 options is the sweet spot,
  4 causes decision fatigue).
- Household-level entitlement is already implemented and is the only Apple-IAP-viable
  model.

## Consequences

- Entitlement (plan, login cap, caps, credit balance) stays **server-authoritative**;
  client UI is UX only; the `DEV_FORCE_SUBSCRIPTION` override stays prod-guarded.
- The paywall shows **two plans** (web + mobile share one config); mobile's hardcoded tier
  array is retired.
- One Stripe price / one RevenueCat product per plan; invited Members **inherit** the
  Household entitlement on login (no IAP purchase of their own).
- Risks: payer (= Guardian) leaving the Household forfeits entitlement (non-transferable
  without re-purchase); de-dup needed if a Household has both a Stripe and a RevenueCat
  subscription (last-write-wins today).
- Apple IAP never exposes payer identity → **Email-Plus VPC is still required** before any
  Baby Persona on iOS (orthogonal to the plan).

## Considered Options

- **Keep Basic/Normal/Plus** — rejected: capability count isn't the product's value axis;
  collaboration is.
- **Per-seat billing for family members** — rejected: Apple can't reconcile seats across
  Apple IDs; anti-steering forbids routing them to Stripe.
- **A separate "voice" add-on tier** — rejected: a 4th decision; dilutes the Family value
  story.
- **Race to $4.99** — rejected: under-signals quality for a keepsake/emotional purchase;
  the market supports a $9.99 entry.
