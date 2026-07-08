# CONTEXT — Glossary

Canonical language for this project. Glossary, not a spec — no implementation
details.

> Working name: **Lullabook** — a parent generates AI stories starring their
> own baby and family as characters. (Provisional.)

---

## Story
Core artifact: a generated narrative starring the family's personas. Story
**text** is the source of truth every other medium derives from.

## Storybook
v1 deliverable: a Story as **Pages**, each pairing text with an illustration.
Curated draft ([ADR-0004](docs/adr/0004-curated-versioned-storybook.md)):
`generating → (draft | failed)`, then `draft → finalized`. `draft` once
every Page is terminal (failed Page = re-rollable hole, not a blocker);
`failed` only if no Story text or too few Pages ready. Only `finalized` is
shareable; drafts stay private to the creator
([ADR-0013](docs/adr/0013-storybook-sharing-privacy.md)).

## Share link
Revocable, non-indexed URL for outside-Family view access to one finalized
Storybook (optional expiry/passcode). The only way a child's likeness
leaves the Family. See [ADR-0013](docs/adr/0013-storybook-sharing-privacy.md).

## Page
One Storybook unit: text passage + one Scene illustration. Holds
**candidates** (each regen = new candidate, parent picks). Text and
illustration regenerate independently.

## Hard-delete
Immediate, total erasure of a Family's data across every store (photos,
LoRA weights, Prompts, Persona metadata, Storybooks). Guardian-triggered,
always available; end-state of the cancellation purge. See
[ADR-0007](docs/adr/0007-data-lifecycle-and-deletion.md).
_Avoid_: "soft delete", "archive" (those retain data).

## Export
Durable downloadable PDF of a finalized Storybook — keepsake survives
cancellation/deletion without us hosting a child's likeness indefinitely.

## Regeneration / re-roll
Fresh candidate for one Page's text or illustration. Bounded by a
per-Storybook **re-roll budget** (free, then credit-metered).

## Medium roadmap
1. **Text** (source of truth). 2. **Illustration** (v1 ships both). 3.
**Audio** (v2). 4. **Video** (v3). Each stage consumes the one before it.

## Character
Photo-free cast member from a **[Trait Questionnaire](#trait-questionnaire)**
— no photos, no LoRA, no biometric data. Powers the free, text-only tier
(skips [Persona](#persona)'s biometric/consent gate). Upgrade seed for a
Persona (attach photos later to promote).
_Avoid_: "Persona" (photo-anchored/LoRA kind only), "profile".

## Trait Questionnaire
Guided Q&A building a Character: name, relationships, favorite
animals/toys/songs, topics. Free-tier analogue of photo upload; feeds the
[Prompt](#prompt) for text-only generation.
_Avoid_: "onboarding" (broader), "the form".

## Persona
Reusable profile anchored on uploaded reference photos of a real person
([ADR-0001](docs/adr/0001-photo-conditioned-likeness.md)) + traits.
**Baby Persona** (starring child, COPPA/GDPR obligations, Guardian-only) vs
**Adult Persona** (co-starring adult, selfie/liveness self-gated,
[ADR-0014](docs/adr/0014-adult-persona-self-consent.md); avoid "Parent
Persona"). Per-persona LoRA ([ADR-0002](docs/adr/0002-per-persona-lora.md));
lifecycle `training → ready/failed`.

## Jurisdiction
Legal regime governing a user, set at signup. Drives child-age threshold,
consent method, data-residency, retention — per-market config, never
hardcoded. v1: Asia + US, each legally gated. See
[ADR-0015](docs/adr/0015-multi-jurisdiction-launch.md).
_Avoid_: "country" (legal-regime unit, not geographic).

## Consent receipt
Stored proof of verifiable parental consent — who, when, notice version —
captured before Baby Persona creation. See
[ADR-0008](docs/adr/0008-verifiable-parental-consent.md).

## Email-Plus VPC
Payment-independent VPC (`consentMethod = email_plus`), required on **iOS**
(Apple IAP can't prove payer identity). Flow: Guardian attests + confirms an
emailed consent link → Family flagged `consent_verified` +
[Consent receipt](#consent-receipt). "Plus" = delayed second confirmation
email with a revoke link. Gates Baby Persona creation; revoking routes
child data to [Hard-delete](#hard-delete)/purge (ADR-0007). See
[ADR-0018](docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md).
_Avoid_: "email verification" (proves an inbox, not consent).

## Subscription
Paid unlock. Family `active`/`inactive`; Stripe (web) or Apple IAP via
RevenueCat (iOS, ADR-0018) flips it. Gate = illustration + Personas:
Character Stories always free; active Subscription unlocks
Character→Persona, illustrated Storybooks, multi-Persona Scenes,
[Personalized Classics](#personalized-classic), [Share links](#share-link),
[Export](#export). Persona count is the cost lever (ADR-0009). See
[ADR-0009](docs/adr/0009-subscription-monetization.md),
[ADR-0016](docs/adr/0016-character-tier-two-tier-consent.md).
_Avoid_: "premium", "pro" (single `active` state in v1).

## Family
Container owning the Persona roster; unit of data ownership + **COPPA
consent boundary**. One or more Members, all sharing every Persona. See
[ADR-0006](docs/adr/0006-family-member-guardian-model.md).

## Member
Human login belonging to a Family. May link a **Self Persona** for
personalization. Story is owned by the Member who created it.
_Avoid_: "User" (generic), "Account" (Family is the account-like unit).

## Guardian
Privileged Member: legal guardian of the child. Only a Guardian creates a
Baby Persona, invites/removes Members, hard-deletes child data. Any Member
may create their own Adult Persona (self-consent).

## Scene
One page's illustration request: Personas (LoRAs) placed into a
setting/action from the Story text. Multi-Persona scenes compose multiple
LoRAs — see [ADR-0005](docs/adr/0005-multi-persona-scenes-in-v1.md).

## Style Bible
Per-Storybook visual constants (wardrobe/appearance per Persona, settings,
palette, time-of-day, art style) generated once with the Story, injected
into every Page's Prompt. See
[ADR-0012](docs/adr/0012-illustration-pipeline-style-bible.md).
_Avoid_: "theme" (a Brief input), "style" alone.

## Likeness confirmation
Post-training step: parent reviews sample generations of a freshly trained
Persona, accepts or re-trains — before a full Storybook spend. See
[onboarding](planning/onboarding-and-personas.md).

## Brief
Parent-facing seed for a Story: starring Personas, a
**[Story Type](#story-type)**, curated theme/lesson, optional
setting/occasion, one optional free-text note. Not the raw model input.
_Avoid_: "Idea", "the prompt" (see Prompt).

## Story Type
Kind of Story chosen per Story in the Brief; shapes generation + narrative
arc, not just a theme. v1: **Bedtime** (calming, no cliffhanger) and
**Learning** (explicit lesson/counting, gentle repetition). Theme = what
it's about; Story Type = what shape it takes.
_Avoid_: "mode", "genre".

## Personalized Classic
Story recast from a public-domain tale with the family's Personas as
characters, instead of invented from a Brief. Same pipeline, adapt-and-recast
contract. Curated public-domain catalog only (copyright + minor-likeness
exposure).
_Avoid_: "remix", "fan-fiction".

## Prompt
Engineered model input derived from a Brief — sent to Claude for Story text.
Internal; parent never writes it directly.

---

## v5 "Maya's World" revamp (PRD v5)
> 2026-06-13. Supersedes bedtime framing where conflicting; code rename not
> done. `planning/prd-v5-maya-world-revamp.md`. Monetization deferred.

- **Household** — account/billing/consent boundary (reframes Family). Owns
  1+ Babies.
- **Baby** — starring child (reframes "Baby Persona"); a Household may have
  several.
- **World** — a Baby's home surface, everything centered on that baby.
- **Family (roster)** — real people who love a Baby (reframes Persona,
  retired in UI). Relationship + two nicknames per baby–person pair, photos
  (ADR-0001/0002), Voice clips. Shared across a Household's babies.
- **Character** — now fictional-only (no photos/voice); free.
- **Voice clip** — real recorded audio woven into stories (incl. lullaby
  weave). Recorded only, no cloning.
- **Video page** — premium: illustration animated ~5-sec with narration.

## Journal & Moments (PRD v6)
> 2026-06-13. Real-life capture loop personalizing generation; builds on v5
> Baby/World. `planning/prd-v6-journal-and-moments.md`,
> [ADR-0019](docs/adr/0019-moments-auto-context-personalization.md).

- **Moment** — single dated parent-logged thing about a Baby. v1: free text
  + date + optional linked people + `significant` flag. One Baby per Moment;
  no new biometric data (existing consent + Hard-delete, ADR-0007).
  _Avoid_: "note", "memory", "entry", "Page"/"Scene".
- **Significant Moment** — Moment with `significant ✨` set; always reaches
  the auto-context layer, pins to Journal timeline. Boolean flag, not a
  score or entity.
- **Journal** — per-Baby surface: Moment timeline + weekly spread view.
  _Avoid_: "diary", "feed", "timeline" alone.
- **Auto-context layer** — injects Moments into the Prompt automatically
  (not a Brief input). Contract: every Significant Moment + ordinary Moments
  since last Story. See [ADR-0019](docs/adr/0019-moments-auto-context-personalization.md).
- **Daily nudge** — once-a-day "What happened today?" card; also push on
  native iOS (issue 30). Never forces a schedule.
- **Weekly Story suggestion** — once-a-week offer assembling a suggested
  Brief from the week's Moments. Parent picks Story Type, confirms before
  spend — never silent.

## Roster avatar (PRD v7)
> 2026-06-14. Display/privacy layer over Persona/roster photos; doesn't
> change likeness training. [ADR-0020](docs/adr/0020-roster-avatar-generated-not-raw-photo.md).

- **Roster avatar** — picture shown for a roster member everywhere: a clean
  illustration generated from that member's trained LoRA, never the raw
  photo. Raw photos still stored/train the model, never rendered. Retraining
  regenerates the avatar; neutral placeholder until `ready`.
  _Avoid_: "profile picture"/"thumbnail".

## Photo-to-story & calendar stories (PRD v8)
> 2026-06-14. Wave on v6 Moment/Journal + lullaby weave, web+native iOS.
> `planning/prd-v8-photo-stories-and-calendar.md`,
> [ADR-0021](docs/adr/0021-moment-photos-write-only-vision-to-text.md).

- **Moment photo** — optional photo on a Moment. Write-only: Family-scoped,
  never rendered (extends ADR-0020), hard-deletable. Vision model reads it
  into a scene description seeding the Brief/auto-context layer; pixels
  never condition illustration or train likeness. No new consent gate
  (ADR-0021).
  _Avoid_: "attachment", "snapshot/gallery".
- **Firsts** — filtered Journal view of milestone/`first` Moments. Logging
  one surfaces an immediate "Make this a Story" offer (distinct from Weekly
  Story suggestion). Confirms Story Type before spend; never silent.
- **Birthday Story** — calendar-triggered offer from a Baby's `birthDate`.
  Same offer→confirm→generate contract. Holiday/jurisdiction calendar
  stories deferred.

## Native mobile feature wave (PRD v9)
> 2026-06-16. Mobile-only (Expo app in `mobile/`, iOS Simulator),
> features-first; `isActive` gate force-unlocked via
> `DEV_FORCE_SUBSCRIPTION`. `planning/prd-v9-mobile-feature-wave.md`.

- **Mobile parity backbone** — wiring every stubbed submit handler (`daily`,
  `family/new`, `characters/[id]` edit, `account`) to the existing
  Bearer-authenticated API (`mobile/lib/api.ts` → `src/app/api/*`), plus
  missing routes (Moments create/list, Storybook create/generate+list). Web
  stays backend; mobile is a native front-end (ADR-0018).
  _Avoid_: "rewrite", "new backend".
- **Mobile Journal** — Journal/Moment/Firsts loop (PRD v6/v8) on native app
  over real data. Same suggestion contract. Free.
- **Mobile Storybook** — native generation (Brief→generate) + reader (paged
  text+illustration, per-Page candidates/re-roll). Force-unlocked in
  simulator. Gate-move belongs to the deferred payment `/part1`.

## Tier
Subscription level: three paid tiers — **Basic** ($8), **Normal** ($15),
**Plus** ($25) — entered via a **Trial**; no free tier. Each sets monthly
**Story cap**, Family-member cap, unlocked capabilities (narration, video,
**Custom art style**). See
[ADR-0023](docs/adr/0023-three-tier-monetization-and-credits.md).

## Trial
7-day free trial of Normal; the only entry point. Card-on-file =
[ADR-0008](docs/adr/0008-verifiable-parental-consent.md)'s consent gate: no
child likeness without it. First-open "aha" runs on a pre-baked baby-free
Demo Story before the card.

## Story cap
Per-Household monthly limit (Basic 4 / Normal 8 / Plus 20). Generous
ceiling; margin protected by breakage/metering, not a stingy cap.
Server-side, idempotent, resets monthly.

## Credit
Meters cost-heavy overage — extra Video pages, Custom art style trainings,
[re-rolls](#regeneration--re-roll). Per-Household ledger; failed metered
action refunds the credit, never blocks the Story. See
[ADR-0023](docs/adr/0023-three-tier-monetization-and-credits.md).

## Custom art style
Plus-tier trained Style LoRA bound to the Household, used as a book's Style
Bible. Credit-metered (1 train/mo included); failure falls back to default.

## Story Context Engine
Deterministic selector assembling bounded story context for a Baby, fed to
the Prompt builder — generalizes the Auto-context layer to roster cast,
age/Firsts, past-Story summary (anti-repeat), moment-photo vision-text
(never raw images). Token-budget bound; significant Moments win on trim;
per-Baby watermark advances only on generation reaching Story text. See
[ADR-0022](docs/adr/0022-story-context-engine.md).

## v13 "Working app + family accounts + 2-plan pricing" (PRD v13)
> 2026-06-22. Supersedes Tier naming (ADR-0025 supersedes ADR-0023, ADR-0024
> extends ADR-0006). `planning/prd-v13-working-app-family-accounts-pricing.md`,
> [ADR-0024](docs/adr/0024-family-accounts-collaborative-creation.md),
> [ADR-0025](docs/adr/0025-two-plan-monetization.md).

- **Just Us** — entry plan ($9.99/mo, $79.99/yr). One creating parent
  (Guardian); others invited view-only. Illustrated Stories; no Voice
  clip/Video page. Replaces Basic/Normal.
- **Our Whole Family** — premium ($24.99/mo, $199.99/yr). Multiple invited
  Members can all create Stories; includes Voice message weave + narration +
  Video pages (credit-metered) + Custom art style. Replaces Plus.
  _Avoid_: "Solo"/"Family" as literal names; "Basic/Normal/Plus" (retired).
- **Invited Member** — real person given own login via email-on-roster +
  invite (Guardian-only). On accept: non-Guardian Member linked to own Adult
  Persona via self-consent (ADR-0014). Resolves the "persona of another
  adult" case by having them make an account. See ADR-0024.
- **Member-login cap** — per-plan limit on Member logins (Just Us = parent
  only; Our Whole Family = whole family). Distinct from the Persona/likeness
  cap.
- **Create-rights** — whether a Member may generate a Story, derived
  server-side from plan+role (Just Us → Guardian only; Our Whole Family →
  every Member).
- **Voice message** — Invited Member's recorded Voice clip; self-consent →
  posts immediately + notifies parents; eligible for lullaby weave/narration
  right away. Recorded only. Our-Whole-Family only.
- **Generation terminal state** — a Storybook generation always ends
  `draft`|`failed`, never stranded in `generating`. Unavailable illustration
  degrades to text-viewable draft, not an endless spinner. Per
  [ADR-0004](docs/adr/0004-curated-versioned-storybook.md).

## R1 simplification + test/observability (PRD v16 / v17)
> 2026-06-23. v16 cuts R1 scope; v17 makes app verifiable+observable.
> `planning/r1-simplify-test-logging-invariants.md`. Amends ADR-0024
> (solo-only), ADR-0025 (solo plan), sequences ADR-0015 (US-only R1.0).

- **Ruthless cut** — a feature not serving the one R1 promise (solo parent
  makes one illustrated Bedtime story starring their baby, kept as PDF) is
  cut. Cuts **audio**, **multi-family**, **Asia** (US-only R1.0). Keeps
  story creation + **Daily Notes**.
- **Inert, not broken** — a deferred feature is gated server-side with no
  reachable UI — never a dead button, 500-ing endpoint, or endless spinner.
  The server gate *is* the cut.
  _Avoid_: "hidden" (implies the endpoint still lives).
- **Daily Notes** — lightweight daily Moment capture kept in R1 (solo, one
  baby). Distinct from deferred machinery (Story Context Engine, Firsts,
  Birthday Story, weekly suggestion, photo-to-story, auto-context).
- **Verify gate** — single command (`npm run verify`) running the whole
  suite, exits non-zero on any real failure.
  _Avoid_: "the tests" (this is the one gate over all of them).
- **Honest seed harness** — deterministic, double-gated fixture: one command
  yields a known-good Household+baby+family+real illustrated book.
  Generalizes R1 issue 124's seed.
- **Error capture** — automatic runtime-error logging from Expo + Next.js
  API into **Sentry** (free tier, EU), scrubbed of child/PII, fails **open**.
  Replaces HockeyApp/App Center. New production error auto-opens a tracked
  GitHub issue (deduped).
  _Avoid_: "telemetry" (broader), "monitoring" (errors, not uptime).

## v19 "Working core loop" (PRD v19)
> 2026-07-06 (Simulator QA). Partially reverses PRD v16 ruthless cut per
> [ADR-0026](docs/adr/0026-restore-journal-and-learning-uncut-r1.md). Audio,
> multi-family, Asia stay cut. `planning/prd-v19-working-core-loop.md`.

- **Placeholder art** — keeps the core loop working without a trained
  likeness: a Character-only/persona-free Brief generates a text-viewable
  Storybook draft with generic art, never `failed`, once text pass succeeds.
  No raw photo, no likeness training (ADR-0020/0021 hold). Extends
  Generation terminal state: text-success ⇒ `draft`.
- **Partial un-cut** — Ruthless cut relaxed for exactly two features —
  per-Baby Journal and the Learning Story Type — each restored with its own
  tests. Cut-flag scaffolding stays so either can be re-cut by env
  (ADR-0026).

## v20 "Working monetization (R1 entry gates)" (PRD v20)
> 2026-07-07. Monetization spine already exists in
> `src/services/{entitlement,story-cap,credit-ledger,subscription,email-plus-vpc,first-open}.ts`;
> this wires the gates + mobile purchase path. Ships R1 one-plan (Just Us),
> Simulator-verifiable fake purchase, closes the COPPA consent hole on Baby
> Persona creation. Real Apple IAP deferred to EAS/TestFlight.
> `planning/prd-v20-monetization-r1.md`,
> [ADR-0027](docs/adr/0027-purchase-controller-fake-first-r1-entry.md).
> Audio, multi-family, Asia stay cut (PRD v16/ADR-0026).

- **PurchaseController** — mobile abstraction over "start the subscription."
  **FakePurchaseController** (R1/Simulator) activates the trial via the
  Start-trial endpoint; real **react-native-purchases** (RevenueCat)
  deferred to EAS. Both converge on the same server subscription state
  (real via webhook, fake via endpoint); `react-native-purchases` can't run
  in Expo Go, so the fake keeps entry verifiable on Simulator (ADR-0027).
  _Avoid_: "mock" (a shipped controller), "IAP" alone (real path only).
- **Start-trial endpoint** — prod-guarded `POST /api/billing/start-trial`,
  activates a 7-day Trial idempotently (`active`, `just_us`,
  `trialEndsAt = now + 7d`) — same state the RevenueCat webhook writes.
  Refused outside non-production/`DEV_*` env; FakePurchaseController only.
  _Avoid_: "checkout" (Stripe/web path).
- **Trial expiry** — Trial carries `trialEndsAt`;
  `SubscriptionService.isActive` = `active` **AND** `now < trialEndsAt`.
  Past expiry → 403 → paywall. Auto-renew/`past_due` grace deferred to
  RevenueCat.
- **Consent gate (Baby Persona)** — server check
  `requireConsentVerified(familyId)` blocking Baby Persona creation until
  `consent_verified` via Email-Plus VPC — closes the COPPA hole
  (`PersonaService.createBaby` had no check before v20). Consent and
  payment are separate mobile gates (ADR-0018/0025): Trial unlocks paying;
  Email-Plus unlocks the legal right. Both required before photos accepted;
  fails closed.
- **R1 entry flow** — first-open order: demo → signup → trial → consent →
  photos (`FirstOpenService.getFlow`). Demo Story earns trust before the
  wall (403→paywall); consent+payment both cleared before photos accepted.
  Demo failure degrades to skip-to-paywall (`onDemoFailed`), never white.
- **Demo Story** — pre-baked, baby-free Story ("Maya and the Moon") shown
  first-open before any card/signup. Static, no spend, no likeness;
  `DemoStoryService`. Stars no Persona, same for every user.
  _Avoid_: "sample"/"preview" (ambiguous); "template" (not editable).

---

_Last updated 2026-07-07 (PRD v20). Provenance for each version's PRD/ADR
links is in that version's blockquote above; versions in order: v5 → v6 →
v7 → v8 → v9 → v12 (Tier/Trial/Story cap/Credit/Custom art
style/Story Context Engine; ADR-0022/0023) → v13 → v16/v17 → v19 → v20._
