# Apple App Review Packet — Lullabook

> Prepared for PRD v14 / issue 135. The launch-gate packet for Apple App Review
> (Guideline 4.2 — kids / biometric data). This document is the reviewer-facing
> walkthrough of the consent flow, data-use, and deletion practices.

## App summary

Lullabook lets a parent generate illustrated AI bedtime storybooks starring
their own baby and family. The app uses the child's likeness (via uploaded
photos → a per-persona LoRA) only to illustrate stories the parent creates.

## Guideline 4.2 — kids / biometric data

The app collects a **minor's biometric data** (baby photos used to train a
likeness model). Apple App Review requires verifiable parental consent + clear
disclosure. Lullabook's flow:

1. **Pre-baked baby-free Demo Story** — a new user reads a fictional illustrated
   story before any sign-up or payment. No child likeness is involved.
2. **Sign-up + 7-day trial** — the parent creates an account and starts a trial
   (Apple IAP via RevenueCat). The card-on-file is the first consent signal.
3. **Email-Plus Verifiable Parental Consent (VPC)** — because Apple IAP cannot
   prove the payer's identity, the parent **separately** attests guardianship
   and confirms via a notice-versioned emailed link. A consent receipt (who,
   when, notice version) is stored. A delayed revoke link is sent.
4. **Baby photo upload** — only **after** consent + entitlement, the parent
   uploads 10–15 baby photos. Photos pass a CSAM hash + safety classifier before
   any training. Raw photos are **write-only** (never rendered; the roster
   avatar is generated, never the raw selfie).
5. **Likeness confirmation** — the parent reviews sample generations and accepts
   before any book-generation spend.

## Privacy disclosures (nutrition labels)

- **Data collected:** baby photos (likeness training), parent email, generated
  storybooks, voice clips (R2). All Family-scoped.
- **Purpose:** to generate illustrated storybooks starring the family.
- **Storage:** per-jurisdiction data-residency region (US: `us-east-1`,
  India: `ap-south-1`).
- **Retention:** generated Storybooks persist until the parent finalizes +
  exports a PDF keepsake, or hard-deletes. Raw photos persist only while the
  Persona is active.
- **Third parties:** Anthropic (text), fal.ai (illustration + LoRA),
  RevenueCat (IAP), Supabase (DB + storage), Sightengine (moderation),
  Resend (email). Each behind an adapter interface.

## Deletion (right to be forgotten)

- **Hard-delete** is always available to the Guardian (never gated by
  subscription state). It erases ALL child data across every store — photos,
  LoRA weights, prompts, persona metadata, generated Storybooks.
- **Consent revoke** clears `consent_verified`, blocks new Baby Persona
  creation, and routes existing child data to the same 30-day purge path.
- The **PDF Export** keepsake is the mechanism by which the keepsake promise
  survives cancellation/deletion — the parent owns a local copy; we do not host
  a child's likeness indefinitely.

## Moderation (fails closed)

- **CSAM hash-match** + safety classifier on every uploaded photo — fails
  closed (unavailable → block, never allow).
- **Image moderation** on every generated output.
- **Text moderation** on every free-text Brief note.

## Test accounts

Reviewer test accounts are provisioned via the dev seed (`DEV_DEMO_SEED`) in the
sandbox build. The live build has no dev bypasses (all dev override paths are
inert when `NODE_ENV === "production"` — pinned by `tests/135-secrets-release-config.test.ts`).
