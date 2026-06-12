# 19 — Character creation via Trait Questionnaire + light consent

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0016, ADR-0015, ADR-0008, ADR-0006
- Glossary: Character, Trait Questionnaire, Persona, Consent receipt

## What to build

Let a parent create a **Character** — a photo-free cast member built from a
**Trait Questionnaire** (name, nickname, relationships, favorite animals/toys and
their names, songs, topics) with **no photos, no LoRA, no biometric**. Creating a
Character for a *real* child runs the **light** consent checkpoint from ADR-0016:
a jurisdiction-aware notice + a single guardian attestation, recorded as a
lightweight Consent receipt variant. A Character marked **fully fictional** skips
even that. The jurisdiction engine (ADR-0015) can **escalate** the checkpoint per
market via config, with no code change. Characters belong to the Family and are
subject to per-Family RLS like every other row.

## Acceptance criteria

- [ ] A parent can create a Character from a Trait Questionnaire with no photo upload and no LoRA/Persona involved.
- [ ] A real-child Character records a light Consent receipt (notice version + attestation + who/when); a fictional Character records none.
- [ ] A jurisdiction configured to require the full path escalates the Character checkpoint with no code change (faked jurisdiction in tests).
- [ ] The heavy biometric gate (verifiable consent, liveness, CSAM) is **not** invoked for Character creation.
- [ ] Tested at the service seam with the consent/jurisdiction engine faked (mirror the Adult-Persona consent test pattern); integration-test per-Family RLS isolation of Characters.

## Blocked by

None — can start immediately.
