# Onboarding & Persona Creation Flow

Product/UX decisions for first-run and Persona creation. Not ADRs (reversible),
but load-bearing for conversion and quality.

## First-run funnel order

Sign up → **pay** (subscription; the card transaction is the VPC, see
[ADR-0008](../docs/adr/0008-verifiable-parental-consent.md)) → **consent**
(notice + receipt) → upload photos → **(training starts in background)** → build
first Brief → generate → curate draft → finalize → export/share.

## Async cold-start: parallelize the wait

A Persona's LoRA training takes minutes ([ADR-0002](../docs/adr/0002-per-persona-lora.md)).
Never show a blocking "please wait" screen after payment. Instead:

- Kick off **LoRA training the instant photos pass moderation**.
- Immediately move the parent into **building their first Brief** — productive
  work that consumes the training minutes.
- If training finishes first (likely), it's seamless; otherwise book generation
  **auto-starts when training completes**, with an **email + web-push** nudge so
  they can leave and return.
- Set expectations up front ("bringing Lily to life — about 5 minutes").

## Persona training inputs & quality gating

- **Require ~10–15 photos** with in-app guidance: varied angles, good lighting,
  one clear face, recent.
- **Automated pre-flight checks at upload** *before* spending GPU: face detected,
  single subject, adequate resolution, not blurry, same-person consistency. This
  is the primary cost-and-quality lever — it catches most training failures at
  the door. (Pre-flight is distinct from the safety/CSAM checks in
  [ADR-0010](../docs/adr/0010-child-safety-defense-in-depth.md), which run first.)
- **Likeness confirmation:** after training, show sample generations ("Does this
  look like Lily?"); the parent accepts or re-trains *before* investing in a full
  book. Doubles as an early read on the multi-LoRA gate
  ([ADR-0005](../docs/adr/0005-multi-persona-scenes-in-v1.md)).

## Failure handling

- Training failure → **auto-retry once**, then **refund the cost/credit**, notify,
  and guide a re-upload. Never silently bill for a dead Persona.
- Uploads are reviewed **automatically only** — no human views the photos except
  in a flagged-safety escalation — both to scale and to avoid staff viewing
  strangers' babies' photos.
