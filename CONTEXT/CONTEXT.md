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
configured. Adult Persona still uses self + liveness; the
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

_Last updated during grill-with-docs session, 2026-06-13 (native iOS effort:
Email-Plus VPC, Subscription gate line)._
