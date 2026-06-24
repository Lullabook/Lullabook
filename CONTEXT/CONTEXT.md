# CONTEXT — Glossary

The canonical language for this project. This file is a glossary, not a spec.
No implementation details live here. Terms are defined as they are resolved
during grilling/planning sessions.

> Working name: **Lullabook** — an app where a parent generates AI stories
> starring their own baby and family as characters. (Name is provisional.)

---

## Story
The core artifact. A generated narrative that stars the family's personas as
characters. The story **text** is the single source of truth that every other
medium (illustration, audio, video) is derived from.

## Storybook
The **v1** deliverable: a Story rendered as a sequence of **Pages**, each pairing
a passage of text with an AI-generated illustration featuring the relevant
personas. The shareable/keepsake unit. A Storybook is a **curated draft**, not a
one-shot output (see [ADR-0004](docs/adr/0004-curated-versioned-storybook.md)):
it has a lifecycle **`generating → (draft | failed)`**, then **`draft →
finalized`**. A book becomes **`draft`** once every Page reaches a terminal state
(a failed/quarantined Page surfaces as a re-rollable hole, not a blocker); it
becomes **`failed`** only when the generation pass produced no Story at all, or
too few Pages came back ready to be worth presenting (a configurable
ready-Page floor). Only a *finalized* Storybook is shareable. **Visibility:** drafts are private to the creating
Member; finalized Storybooks are visible to all Family Members and shareable
outside the Family only via a revocable [Share link](#share-link). See
[ADR-0013](docs/adr/0013-storybook-sharing-privacy.md).

## Share link
A revocable, non-indexed URL granting outside-the-Family view access to one
finalized Storybook (optional expiry/passcode). The only way a child's likeness
leaves the Family, and always revocable. See
[ADR-0013](docs/adr/0013-storybook-sharing-privacy.md).

## Page
One unit of a Storybook: a passage of Story text paired with one illustration of
its Scene. A Page holds **candidates** — each regeneration produces a new
candidate; the parent picks which one the Page shows. Text and illustration are
regenerated **independently**.

## Hard-delete
Immediate, total erasure of a Family's data across **every** store — photos,
LoRA weights, Prompts, Persona metadata, and generated Storybooks. A
Guardian-triggered, always-available action (the "right to be forgotten"), and
the end-state of the cancellation purge. See
[ADR-0007](docs/adr/0007-data-lifecycle-and-deletion.md).
_Avoid_: "soft delete", "archive" (those retain data; hard-delete does not).

## Export
Producing a durable, downloadable copy of a finalized Storybook (PDF) that lives
on the parent's device. The mechanism by which the keepsake promise survives
cancellation/deletion without us hosting a child's likeness indefinitely.

## Regeneration / re-roll
Producing a fresh candidate for a single Page's text or illustration. Bounded by
a per-Storybook **re-roll budget** (free re-rolls, then credit-metered) so a
single book can't blow up unit economics.

## Medium roadmap
The forms a Story can take, built in dependency order because each consumes the
one before it:
1. **Text** — the script / source of truth.
2. **Illustration** — images anchored to the text (v1 ships text + illustration as the Storybook).
3. **Audio** — narration of the text (v2).
4. **Video** — text + illustration + audio in motion (v3).

## Character
A lightweight, **photo-free** cast member built from a **[Trait
Questionnaire](#trait-questionnaire)** — a name, nickname, relationships, and
traits/catchphrases ("what papa generally says") — with **no uploaded photos, no
LoRA, no biometric data**. Characters power the **free, text-only** story tier:
because no likeness is generated, they skip the heavy biometric/consent gate that
[Personas](#persona) require. A Character may be fully fictional or modeled on a
real family member; the app never asks for photographic proof. A Character is the
**upgrade seed** for a Persona — a parent who later wants illustrations attaches
photos to promote a Character into a Persona.
_Avoid_: "Persona" (that term is reserved for the photo-anchored, LoRA-backed
kind), "profile" (ambiguous).

## Trait Questionnaire
The guided Q&A a parent fills in to build a [Character](#character): name,
nickname, full name, family relationships (papa/mama/grandparent names), favorite
animals/toys (and their names), songs, and topics the child likes (dinosaurs,
superheroes…). It is the free-tier analogue of uploading photos — it captures
*who the character is* in words rather than likeness. Feeds the [Prompt](#prompt)
for text-only Story generation.
_Avoid_: "onboarding" (broader), "the form".

## Persona
A reusable character profile set up once and reused across many Stories.
**Anchored on uploaded reference photos of a real person** (see
[ADR-0001](docs/adr/0001-photo-conditioned-likeness.md)) plus descriptive
traits. Belongs to a [Family](#family) and is usable by every Member of it. Two
kinds:
- **Baby Persona** — the starring child. Built from photos of a minor, which
  carries biometric/consent/COPPA/GDPR obligations. Only a
  [Guardian](#guardian) may create one.
- **Adult Persona** — a co-starring adult family member (parent, grandparent,
  aunt…). Must be the **creator themselves**, gated by a selfie/liveness match
  ([ADR-0014](docs/adr/0014-adult-persona-self-consent.md)). _Avoid_: "Parent
  Persona" (a grandparent isn't a parent).

Each Persona is realized as a **per-persona LoRA** fine-tuned on the uploaded
photos (see [ADR-0002](docs/adr/0002-per-persona-lora.md)). A Persona therefore
has a lifecycle: **`training` → `ready` / `failed`**, because creating one is an
async, paid background job.

## Jurisdiction
The legal regime governing a given user, detected/declared at signup. Drives the
**child-age threshold**, **consent method**, **data-residency region**, and
notice/retention rules — all **configurable per market**, never hardcoded. v1
launches across Asia + US, each market gated by its own legal review. See
[ADR-0015](docs/adr/0015-multi-jurisdiction-launch.md).
_Avoid_: "country" (jurisdiction is the legal-regime unit, not strictly geographic).

## Consent receipt
The stored proof that a Guardian gave verifiable parental consent — who
consented, when, and to which version of the consent notice — captured before a
Baby Persona is created. See
[ADR-0008](docs/adr/0008-verifiable-parental-consent.md).

## Email-Plus VPC
A **payment-independent** Verifiable Parental Consent method (`consentMethod =
email_plus`), required on the **iOS** surface because Apple IAP cannot prove the
payer's identity, so the web "payment = consent" path (ADR-0008) does not hold
there. The flow: the Guardian enters their email and attests guardianship → the
backend emails a unique consent link stamped with the current notice version →
the Guardian opens it, sees exactly what is collected (baby photos → biometric
LoRA) and confirms → the [Family](#family) is flagged `consent_verified` with a
version-stamped [Consent receipt](#consent-receipt). The **"plus"** is a
*delayed second confirmation email* with a revoke link sent after the first
confirmation. It is one of the configurable per-[Jurisdiction](#jurisdiction)
consent methods (ADR-0015), and **gates Baby Persona creation** wherever
configured. The consent request is retained as the audit record; the revoke link
stays available (a Guardian may **withdraw** consent at any time, COPPA), and
revoking clears the Family's `consent_verified` — blocking new Baby Persona
creation and routing existing child data to the [Hard-delete](#hard-delete) /
purge path (ADR-0007). Adult Persona still uses self + liveness; the
[Character](#character) tier still uses the light attestation. See
[ADR-0018](docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md).
_Avoid_: "email verification" (that proves an inbox, not parental consent).

## Subscription
The paid unlock. A [Family](#family) is `active` or `inactive`; either payment
rail flips the same state — **Stripe** on web, **Apple IAP via RevenueCat** on
iOS (ADR-0018). The **gate line is illustration + Personas**: text-only Stories
from a [Character](#character) are **always free** (the acquisition hook); an
active Subscription unlocks **everything else** — promoting a Character into a
[Persona](#persona), illustrated [Storybooks](#storybook), multi-Persona Scenes,
[Personalized Classics](#personalized-classic), [Share links](#share-link), and
[Export](#export). Persona count stays the cost lever (ADR-0009); Storybooks are
unlimited under fair use. See
[ADR-0009](docs/adr/0009-subscription-monetization.md),
[ADR-0016](docs/adr/0016-character-tier-two-tier-consent.md).
_Avoid_: "premium", "pro" (no named tiers in v1 — it is a single `active` state).

## Family
The shared container that owns the Persona roster and is the unit of data
ownership and the **COPPA consent boundary**. Has one or more
[Members](#member). Every Member can use every Persona in the Family.
See [ADR-0006](docs/adr/0006-family-member-guardian-model.md).

## Member
A human login belonging to a Family (mom, dad, grandparent…). Each Member may be
linked to a **Self Persona** — their own Adult Persona — so their account is
personalized (e.g. grandma's stories default to grandma + the baby). All Members
share use of every Persona; a Story is owned by the Member who created it.
_Avoid_: "User" (too generic), "Account" (the Family is the account-like unit).

## Guardian
A privileged [Member] role: the legal guardian of the child. **Only a Guardian
may create a Baby Persona** (the act that captures COPPA consent), invite/remove
Members, and hard-delete the child's data. Pins COPPA accountability to one
identifiable adult. Any Member (not just a Guardian) may create their own Adult
Persona, since that is consent to one's *own* likeness.

## Scene
A single page's illustration request: one or more Personas (their LoRAs) placed
into a described setting/action derived from the Story text. Multi-Persona scenes
(baby + parent together) compose multiple LoRAs — see
[ADR-0005](docs/adr/0005-multi-persona-scenes-in-v1.md).

## Style Bible
The per-Storybook set of visual constants that hold every Page together: each
Persona's wardrobe/appearance, recurring settings, palette, time-of-day, and the
chosen art style. Generated once with the Story and injected into every page's
image Prompt so the book reads as one coherent work rather than 12 unrelated
images. See [ADR-0012](docs/adr/0012-illustration-pipeline-style-bible.md).
_Avoid_: "theme" (that's a Brief input), "style" alone (ambiguous).

## Likeness confirmation
The post-training step where the parent reviews sample generations of a freshly
trained Persona and either accepts it or re-trains — *before* investing in a full
Storybook. See [onboarding](planning/onboarding-and-personas.md).

## Brief
The parent-facing seed for a Story. A **hybrid** input: a selection of starring
Personas, a chosen **[Story Type](#story-type)**, a curated **theme/lesson**, an
optional curated **setting/occasion**, and one short optional free-text note
("anything special to include?"). The Brief is what the parent fills in; it is
*not* the raw model input.
_Avoid_: "Idea", "the prompt" (see Prompt below).

## Story Type
The kind of Story being generated, chosen per Story in the [Brief](#brief). It
shapes the generation pass's instructions and narrative arc — it is **not** just
a theme. v1 types:
- **Bedtime** — a calming wind-down arc with a soft landing (no cliffhanger),
  engineered to ease the child toward sleep.
- **Learning** — carries an explicit lesson, message, or early-numeracy/counting
  thread woven into the narrative, with gentle repetition.

Story Type is distinct from the **theme/lesson** field of a Brief: theme is *what
the story is about*; Story Type is *what shape the story takes*.
_Avoid_: "mode", "genre" (overloaded).

## Personalized Classic
A Story whose origin is an **existing public-domain tale** recast with the
family's [Personas](#persona) as its characters (e.g. *Alice in Wonderland*
starring grandma), rather than an original narrative invented from a
[Brief](#brief). Same downstream pipeline as any Story (Scenes, Style Bible,
Pages), but a different generation contract: adapt-and-recast, not invent. v1
scope, but its **own** build slice after the core generate path. Restricted to a
**curated public-domain catalog** — no arbitrary "famous stories" — to avoid
copyright exposure stacked on the minor-likeness obligations.
_Avoid_: "remix", "fan-fiction" (legally loaded).

## Prompt
The **engineered model input** derived from a Brief — the structured instruction
sent to Claude to generate Story text. Internal; the parent never writes it
directly. Distinct from the Brief to keep parent-intent separate from
machine-facing wording.

---

## v5 "Maya's World" revamp — incoming language (PRD v5)

> Grilled 2026-06-13. These supersede the bedtime framing where they conflict, but
> the **code rename has not happened yet** — the terms above still describe current
> code. See `planning/prd-v5-maya-world-revamp.md`. Monetization/paywall is deferred.

- **Household** — the account / billing / consent boundary. Reframes the old
  [Family](#family)=account. Owns **one or more Babies**.
- **Baby** — a starring child (reframes "Baby Persona"). A Household may have several.
- **World** — a Baby's home surface; everything centered on that baby. One per Baby.
- **Family (roster)** — the real people who love a Baby (reframes [Persona](#persona),
  retired in UI). Each has a **relationship** + two nicknames (what the baby calls
  them / what they call the baby) **per baby–person pair**, **photos** (likeness model
  still per ADR-0001/0002), and **Voice clips**. Shared across a Household's babies by
  default; a baby added as a "different family" gets its own roster.
- **Character** — now **fictional-only** (no photos/voice); free. Real people live in
  the Family roster, not here.
- **Voice clip** — a real recorded audio line from a Family member, woven into stories
  (incl. a **lullaby-ending weave**). Recorded only in v1 — **no voice cloning**.
- **Video page** — premium: a page's illustration animated into a ~5-sec clip with the
  page's narration over it (short books only).

---

## Journal & Moments — incoming language (PRD v6)

> Grilled 2026-06-13. Adds a real-life capture loop that personalizes generation.
> Builds on the v5 [Baby](#baby)/[World](#world) language above. See
> `planning/prd-v6-journal-and-moments.md` and
> [ADR-0019](docs/adr/0019-moments-auto-context-personalization.md). Monetization
> deferred (tier-agnostic, consistent with PRD v5).

- **Moment** — a single dated, parent-logged thing that happened to a **Baby**
  ("Maya took her first steps today"). The raw material that makes Stories
  personal. **Light structure (v1):** free text + a date + optional **linked
  people** (which [Family](#family-roster) members / [Characters](#character) were
  present) + a **`significant`** flag. Mood and photo attachments are a deliberate
  later "rich-structure" pass, not v1. A Moment belongs to exactly **one Baby**
  (one [World](#world)); it carries no new biometric data, so it rides the Baby's
  existing consent and the [Hard-delete](#hard-delete)/purge path (ADR-0007)
  rather than a new consent gate.
  _Avoid_: "note" (too sticky-note), "memory" (collides with the keepsake framing
  and is undated), "entry" (generic), "Page"/"Scene" (those belong to a Storybook).

- **Significant Moment** — a Moment with its `significant ✨` flag set. It always
  reaches the [auto-context layer](#auto-context-layer) regardless of recency and
  pins to the [Journal](#journal) timeline. The flag is how a parent says "this day
  mattered — weigh it." Modeled as a boolean flag, **not** a separate "Milestone"
  entity and **not** a 1–5 score.

- **Journal** — a **per-Baby** surface inside the [World](#world) ("Maya's
  Journal") holding the timeline of [Moments](#moment) plus a **weekly spread**
  view (the "day in the life" layout). One Journal per Baby. The home of the daily
  capture loop and the weekly-story suggestion.
  _Avoid_: "diary" (first-person; the baby can't write), "feed", "timeline" alone.

- **Auto-context layer** — the mechanism by which [Moments](#moment) personalize
  generation. Recent Moments are injected into the [Prompt](#prompt) as background
  context automatically — they are **not** a [Brief](#brief) input the parent
  curates per Story. **Contract:** every [Significant Moment](#significant-moment)
  for the Baby + every ordinary Moment logged **since that Baby's last Story**.
  See [ADR-0019](docs/adr/0019-moments-auto-context-personalization.md).

- **Daily nudge** — the once-a-day "What happened today?" capture prompt. Surfaces
  as a card on the [World](#world) home everywhere; on native iOS it additionally
  fires through the existing push infrastructure (issue 30). It drives the capture
  habit but never forces a schedule — capture stays free-form (log anytime).

- **Weekly Story suggestion** — a once-a-week offer ("Make Maya's week into a
  story") that assembles a **suggested [Brief](#brief)** from that week's
  [Moments](#moment): the Baby stars, the cast is the people linked in the week's
  Moments, and the theme is seeded from the [Significant Moments](#significant-moment).
  The parent picks [Story Type](#story-type) and **confirms before any generation
  spend** — a one-tap suggestion, **never** silent background generation.

---

## Roster avatar — incoming language (PRD v7)

> Grilled 2026-06-14. A display/privacy layer over the existing
> [Persona](#persona)/Family-roster photos. Does **not** change how likeness is
> trained. See [ADR-0020](docs/adr/0020-roster-avatar-generated-not-raw-photo.md).

- **Roster avatar** — the picture shown for a roster member (Baby or adult)
  everywhere in the app. It is a clean illustration **generated from that member's
  trained likeness LoRA**, never their raw uploaded photo. The raw reference photos
  are still stored and still train the likeness model (Story + video generation);
  they are simply **never rendered on any display surface** (roster cards, story
  credits, member pickers). A member can update their reference photos, which
  retrains the LoRA and regenerates the avatar. Until training reaches `ready`, a
  neutral placeholder stands in.
  _Avoid_: "profile picture" / "thumbnail" (both imply the raw selfie this replaces).

---

## Photo-to-story & calendar stories — incoming language (PRD v8)

> Grilled 2026-06-14. A feature wave on the v6 [Moment](#journal--moments--incoming-language-prd-v6)/[Journal](#journal)
> loop plus the already-shipped lullaby weave, web **and** native iOS. Monetization
> and TestFlight stay deferred. See `planning/prd-v8-photo-stories-and-calendar.md`
> and [ADR-0021](docs/adr/0021-moment-photos-write-only-vision-to-text.md).

- **Moment photo** — an optional photo attached to a [Moment](#moment) (the
  rich-structure pass v6 deferred). It is **write-only**: stored Family-scoped,
  **never rendered on any surface** (extends [ADR-0020](docs/adr/0020-roster-avatar-generated-not-raw-photo.md)),
  retained and hard-deletable (ADR-0007). A vision model reads it into a **scene
  description** that seeds the [Brief](#brief) / [auto-context layer](#auto-context-layer);
  its pixels **never** condition the illustration and it **never** trains likeness.
  Rides the Baby's existing consent — no new gate. (ADR-0021)
  _Avoid_: "attachment" (generic), "snapshot/gallery" (imply it's displayed).

- **Firsts** — a filtered [Journal](#journal) view of the Baby's milestone/`first`
  [Moments](#moment) (the `momentType` already in code). Logging a "first" surfaces
  an **immediate** "Make this a Story" offer inline — distinct from the once-a-week
  [Weekly Story suggestion](#weekly-story-suggestion). Still an offer that confirms
  [Story Type](#story-type) before any generation spend; never silent.

- **Birthday Story** — a calendar-triggered Story offer fired from a Baby's
  **`birthDate`** (a new field on Baby). Same suggestion contract (offer → confirm →
  generate; never silent). Holiday/jurisdiction-aware calendar stories are
  **deferred** to a later wave.

---

## Native mobile feature wave — incoming language (PRD v9)

> Grilled 2026-06-16. This wave is **mobile-only** (the Expo app in `mobile/`, driven
> on the iOS Simulator) and **features-first**. **Monetization is deferred to its own
> later `/part1`** — no paywall UX, pricing, or live billing ships in this wave; the
> existing `isActive` gate stays as-is and is force-unlocked in the simulator via
> `DEV_FORCE_SUBSCRIPTION`. See `planning/prd-v9-mobile-feature-wave.md`.

- **Mobile parity backbone** — the work of making the native app *actually function*:
  every stubbed submit handler (`daily`, `family/new`, `characters/[id]` edit,
  `account`) wired to the existing **Bearer-authenticated API** (`mobile/lib/api.ts`
  → `src/app/api/*`), plus the **missing API routes** the mobile features need
  (Moments create/list, Storybook create/generate + list). The web stays the backend;
  mobile is a native front-end over the same domain services (ADR-0018). _Avoid_:
  "rewrite", "new backend" (the services already exist — this is wiring + a few routes).

- **Mobile Journal** — the [Journal](#journal)/[Moment](#moment)/[Firsts](#firsts)
  capture loop (PRD v6/v8) brought to the native app over real data: log a Moment,
  see the per-Baby timeline, filter the Firsts view, and take the inline
  "make this a Story" offer. Same suggestion contract (offer → confirm Story Type →
  generate; never silent). Tier-agnostic / free.

- **Mobile Storybook** — native [Storybook](#storybook) generation (Brief → generate)
  and the **reader** (paged text + illustration, per-Page candidates/re-roll) on the
  device. Rides the existing generation pipeline + gate; in the simulator the gate is
  force-unlocked. The future gate-move (illustrations free, paywall = narration +
  voice + video + length, per `planning/pricing-and-features-2026-06-13.md`) belongs
  to the deferred **payment `/part1`**, not this wave.

## Tier
The subscription level a Household is on. **Three paid tiers** — **Basic** ($8), **Normal**
($15), **Plus** ($25) — entered via a **Trial**. There is **no free tier**. Each tier sets a
monthly **Story cap**, a Family-member cap, and which capabilities (narration, video,
**Custom art style**) are unlocked. See
[ADR-0023](docs/adr/0023-three-tier-monetization-and-credits.md).

## Trial
The **7-day free trial of Normal** that is the only entry point. **A card-on-file is
required to start it**, which is what makes it the Verifiable Parental Consent gate
([ADR-0008](docs/adr/0008-verifiable-parental-consent.md)): **no child likeness is created
without it.** The first-open "aha" runs on a pre-baked, **baby-free Demo Story** before the
card.

## Story cap
The per-Household monthly limit on generated Stories (Basic 4 / Normal 8 / Plus 20). A
**generous ceiling**, not a hard quota most users reach — margin is protected by **breakage**
and metering, not by a stingy cap. Enforced server-side and idempotently. Resets monthly.

## Credit
The unit that meters **cost-heavy overage** beyond a tier's included allotment — extra
**Video pages**, extra **Custom art style** trainings, and extra
[re-rolls](#regeneration--re-roll). Tracked in a per-Household ledger; a **failed** metered
action **refunds** the credit and never blocks the Story. See
[ADR-0023](docs/adr/0023-three-tier-monetization-and-credits.md).

## Custom art style
A **Plus**-tier **trained Style LoRA** (from reference images / a seed) bound to the
Household and used as a book's **Style Bible**. A real training cost (hence credit-metered:
1 train/mo included); on failure the Story falls back to the default Style Bible. Distinct
from picking a preset style.

## Story Context Engine
The **deterministic selector** that assembles a bounded **story context set** for a Baby and
feeds it to the [Prompt] builder — generalizing the Moments
[Auto-context layer](#auto-context-layer) to roster cast, age/[Firsts], a **past-Story
summary** (continuity / anti-repeat), and moment-photo vision-text (never raw images). Bound
by a token budget; significant [Moments](#moment) always win on trim; the per-Baby watermark
advances only on a generation that reaches Story text. See
[ADR-0022](docs/adr/0022-story-context-engine.md).

## v13 "Working app + family accounts + 2-plan pricing" — incoming language (PRD v13)

> Grilled 2026-06-22 (hands-on Simulator testing). Supersedes the Tier naming where it
> conflicts: ADR-0025 supersedes ADR-0023, ADR-0024 extends ADR-0006. Code rename not
> done yet. See `planning/prd-v13-working-app-family-accounts-pricing.md`,
> [ADR-0024](docs/adr/0024-family-accounts-collaborative-creation.md),
> [ADR-0025](docs/adr/0025-two-plan-monetization.md).

- **Just Us** — the entry plan ($9.99/mo, $79.99/yr). **One creating parent** (the
  [Guardian](#guardian)); other people may be invited as **view-only**
  [Members](#member). Illustrated [Stories](#story); **no [Voice clip](#voice-clip), no
  Video page**. Replaces the Basic/Normal tier naming.
- **Our Whole Family** — the premium plan ($24.99/mo, $199.99/yr). **Multiple invited
  [Members](#member) who can all create** Stories for the [Baby](#baby); includes
  **[Voice message](#voice-message)** weave + AI narration and **Video pages**
  (credit-metered), plus [Custom art style](#custom-art-style). The "profitable" tier;
  replaces Plus. _Avoid_: "Solo"/"Family" as the literal plan names; "Basic/Normal/Plus"
  (retired).
- **Invited Member** — a real person (e.g. a grandparent) given their own login in the
  [Household](#household) by attaching an **email to a roster person** and sending an
  invite (Guardian-only). On accept they become a **non-Guardian** [Member](#member)
  linked to their own [Adult Persona](#persona) (their Self Persona) via **self-consent**
  (ADR-0014). This is the case ADR-0014 deferred ("a persona of another adult who won't
  make an account") — resolved by having them *make an account*. See ADR-0024.
- **Member-login cap** — the per-plan limit on how many Member **logins** a Household may
  have (Just Us = the parent; Our Whole Family = the whole family). **Distinct from** the
  likeness/[Persona](#persona) cap (which guards LoRA-training cost). The collaboration
  lever that the Family plan sells.
- **Create-rights** — whether a given [Member](#member) may generate a Story, derived
  **server-side** from the Household plan + the Member's role (Just Us → only the
  Guardian; Our Whole Family → every Member). The per-member generation gate.
- **Voice message** — an [Invited Member](#invited-member)'s recorded [Voice
  clip](#voice-clip) contribution. Because the recorder self-consents to their own voice,
  it posts to the Baby's [World](#world) **immediately** and **notifies** the parents;
  eligible for the lullaby weave / narration right away. Recorded only — no cloning.
  Our-Whole-Family only.
- **Generation terminal state** — a [Storybook](#storybook) generation **always** ends in
  a terminal status (`draft` | `failed`) on **every** workflow path (including local-dev),
  never stranded in `generating`/"Illustrating". When illustration is unavailable, the
  book degrades to a **text-viewable** draft rather than an endless spinner. (Lifecycle
  per [ADR-0004](docs/adr/0004-curated-versioned-storybook.md).)

## R1 simplification + test/observability — incoming language (PRD v16 / v17)

> Grilled 2026-06-23. Two PRDs that sit on top of the R1 release (v14): **v16** cuts R1
> scope harder and **v17** makes the app verifiable + observable. Decisions/invariants in
> `planning/r1-simplify-test-logging-invariants.md`. Amends ADR-0024 (solo-only), ADR-0025
> (solo plan), sequences ADR-0015 (US-only R1.0). Code rename not done yet.

- **Ruthless cut** — the v16 principle: a feature not serving the one R1 promise (a solo
  parent makes one illustrated Bedtime story starring their baby, kept as a PDF) is *a way to
  break*, so it is **cut**. R1 cuts **audio** (voice clips/messages, lullaby weave, narration),
  **multi-family** (invited members, family logins, collaborative plan, multi-baby), and **Asia**
  (US-only R1.0). Keeps story creation + **Daily Notes**.
- **Inert, not broken** — the load-bearing v16 invariant: a deferred feature is **gated
  server-side with no reachable UI** — never a dead button, a 500-ing endpoint, or an endless
  spinner. The server gate *is* the cut; hiding a button is not. _Avoid_: "hidden" (implies the
  endpoint still lives).
- **Daily Notes** — the lightweight daily [Moment](#moment) capture kept in R1 (solo, one baby).
  Distinct from the deferred heavy machinery ([Story Context Engine](#story-context-engine),
  Firsts, Birthday Story, weekly suggestion, photo-to-story, auto-context injection).
- **Verify gate** — the v17 single command (`npm run verify`) that runs the whole suite and
  **exits non-zero on any real failure**: the machine-checkable "is the app healthy?" gate an
  agent loops against instead of judging by eye. _Avoid_: "the tests" (this is the one gate over
  all of them).
- **Honest seed harness** — a deterministic, double-gated fixture: one command yields a
  known-good Household + baby + family + a **real illustrated** book, so testing never starts
  from zero. Generalizes R1 issue 124's seed into a reusable fixture.
- **Error capture** — automatic runtime-error logging from **both** the Expo app and the
  Next.js API into **Sentry** (free tier, EU region), scrubbed of all child/PII data, that
  **fails open** (a logging outage never breaks the app — the deliberate opposite of moderation,
  which fails closed). Replaces the retired HockeyApp/App Center lineage. A new production error
  **auto-opens a tracked GitHub issue** (deduped), closing the "bugs vanish" loop.
  _Avoid_: "telemetry" (broader/analytics-flavored), "monitoring" (this is errors, not uptime).

---

_Last updated 2026-06-23: added PRD v16/v17 language (Ruthless cut, Inert-not-broken, Daily
Notes, Verify gate, Honest seed harness, Error capture [Sentry, fail-open, error→issue]; amends
ADR-0024 solo-only + ADR-0025 solo plan, sequences ADR-0015 US-only R1.0). Prior update
2026-06-22: added PRD v13 language (Just Us / Our Whole Family two-plan
model superseding the Basic/Normal/Plus Tier; Invited Member, Member-login cap,
Create-rights, Voice message, Generation terminal state; ADR-0024 family accounts extends
ADR-0006, ADR-0025 monetization supersedes ADR-0023). Prior update 2026-06-21: added PRD v12 language (Tier [Basic/Normal/Plus], Trial-as-entry
[no free tier], Story cap, Credit, Custom art style [Style LoRA], Story Context Engine;
ADR-0022 supersedes ADR-0019, ADR-0023 supersedes ADR-0009 + parts of ADR-0016 and updates
ADR-0008). Prior update 2026-06-16: added PRD v9 language (mobile feature wave — parity
backbone, mobile Journal, mobile Storybook; payment deferred with Free+paid+credits direction
recorded). Prior update 2026-06-14: added PRD v8 language (Moment photo write-only + vision→text,
Firsts, Birthday Story; ADR-0021). Prior update 2026-06-14: added Roster avatar language
(display generated avatars, never raw photos; PRD v7, ADR-0020). Prior update 2026-06-13:
added Journal & Moments language (Moment, Significant Moment, Journal, Auto-context layer,
Daily nudge, Weekly Story suggestion; PRD v6, ADR-0019), and v5 "Maya's World" revamp
language (Household, World, multi-Baby, Family-roster, Voice clip, Video page)._
