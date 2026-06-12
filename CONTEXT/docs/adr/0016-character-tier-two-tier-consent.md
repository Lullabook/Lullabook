# 0016 — Free text-only Character tier and two-tier consent

- Status: Accepted
- Date: 2026-06-10
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0008](0008-verifiable-parental-consent.md), [ADR-0009](0009-subscription-monetization.md), [ADR-0015](0015-multi-jurisdiction-launch.md)

## Context

The original v1 model bound every Story to a photo-anchored **Persona** (a
per-persona LoRA, ADR-0002), which drags in the full biometric-consent gate
(verifiable parental consent, liveness, CSAM hash-match) and a paid LoRA training
job. That gate is correct for *likeness* but disproportionate for **text-only**
stories, which carry no image of the child at all — only a name and descriptive
traits. A text-only tier with no likeness is both a cheaper top-of-funnel and a
materially lower legal-risk surface, but only if the data model and consent flow
keep the two cases unambiguous.

The cost driver (ADR-0009) is LoRA training, not text generation
(~3–5¢/story). So a free, no-likeness text tier does not undercut the
subscription economics, which price Personas/illustrated Storybooks/audio/video.

## Decision

- Introduce **Character** — a photo-free cast member built from a **Trait
  Questionnaire** (name, relationships, traits/catchphrases), with no photos, no
  LoRA, no biometric data. Characters power the **free, text-only** Story tier.
  A Character is the upgrade seed for a Persona: attaching photos promotes a
  Character into a Persona when the parent wants illustrations.
- **Two-tier consent**, escalatable per jurisdiction by the ADR-0015 engine:
  - **Character (light tier):** a jurisdiction-aware **notice + single
    guardian attestation** ("I am a parent/guardian creating this for my own
    family"), logged as a lightweight Consent receipt variant. No liveness, no
    photo, no payment. A market that requires verifiable consent even for
    name-only minor data can flip this to the full path via config — no code
    change.
  - **Persona (full tier):** unchanged — verifiable parental consent + payment
    VPC + liveness + CSAM hash-match (ADR-0008, ADR-0010). The heavy gate stays
    bound to the point where a biometric actually appears.
- **Personas remain a distinct concept from Characters.** The consent boundary
  is a property of the *type*, never a per-row "is this one biometric?" flag, so
  RLS and consent code never has to branch on it.

## Consequences

- Two cast concepts (Character, Persona) and two consent paths to maintain, but
  each is internally unambiguous — the expensive ambiguity (per-row biometric
  status) is designed out.
- The free tier is a genuine acquisition channel with near-zero friction (one
  attestation) while keeping the biometric obligations isolated to the paid
  Persona path.
- "Free text-only stories" become a v1 build slice of their own, separate from
  the illustrated-Storybook generate path.

## Considered Options

- **Reuse Persona with an optional/absent LoRA** — one concept, but it makes the
  biometric-consent status a per-row question that every RLS and consent check
  must branch on. Rejected: ambiguity on the exact axis (minor data) that most
  needs to be provable.
- **Fully-fictional Characters only (zero real-child data permitted)** — simplest
  legally, but forbids the product's core "stars your own family" promise at the
  free tier. Rejected in favor of the light attestation + jurisdiction escalation.

## Revisit if

- A launch market's regulator treats name-plus-traits minor data as requiring
  the full verifiable-consent path universally, collapsing the two tiers in that
  market (already handled by config, but may warrant rethinking the free tier's
  viability there).
