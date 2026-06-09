# 0010 — Defense-in-depth content safety for child-image generation

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0005](0005-multi-persona-scenes-in-v1.md)

> ⚠️ Engineering design intent, not legal advice. Obligations around CSAM
> detection and NCMEC reporting must be confirmed with counsel before launch.

## Context

Lullabook generates images of real, identified minors from uploaded photos. This
is the highest-consequence surface in the product: illegal uploads (CSAM, or
photos of a child the uploader has no right to), unsafe model output even from
innocent input, an abusable free-text Brief, and legal reporting duties if CSAM
is detected. Relying on the image/LLM providers' built-in filters is not a
defensible posture here.

## Decision

Ship **layered (defense-in-depth) content safety** in v1:

1. **Input layer.** Every uploaded photo runs through known-CSAM hash matching
   (e.g. PhotoDNA) **and** a safety classifier *before* storage or training. The
   free-text Brief runs through a moderation classifier (plus Claude's own
   refusal behavior).
2. **Constrained generation.** Curated themes/settings only (the Brief is mostly
   structured); the engineered Prompt hard-codes wholesome, clothed,
   age-appropriate scene constraints; negative prompts on the image model.
3. **Output layer.** Every generated image passes a safety classifier *before*
   the parent sees it; failures are blocked and auto-re-rolled or quarantined.
4. **Provider filters stay ON** (fal.ai, Anthropic) — never disabled.
5. **Reporting & enforcement.** An audit trail, an NCMEC reporting path for
   detected CSAM, abuse reporting, and account bans on violations.

## Consequences

- Pre-launch dependencies: access to a CSAM hash-matching service, a moderation
  API, and a defined NCMEC reporting workflow. These gate launch.
- A small false-positive rate will block some innocent images; accepted as the
  cost of safety, with a human-review/appeal path.
- Every image generation incurs an extra moderation call (latency + cost) on top
  of inference — folded into unit economics.
