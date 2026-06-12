# 21 — Character → Persona upgrade

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0016, ADR-0008, ADR-0002, ADR-0010
- Glossary: Character, Persona, Trait Questionnaire, Consent receipt

## What to build

Let a parent promote an existing **Character** into a **Persona** by attaching
reference photos, so they can move from free text-only Stories to illustrated
Storybooks without re-entering anything. Promotion carries the Character's traits
forward and enters the **full** gate: verifiable parental consent + payment VPC +
liveness (for an Adult) / Guardian path (for a Baby) + moderation, then per-Persona
LoRA training (Persona lifecycle `training → ready / failed`). The Character and
the resulting Persona remain distinct concepts; the upgrade does not retroactively
make other Characters biometric.

## Acceptance criteria

- [ ] A parent can attach photos to a Character to promote it into a Persona; the Character's traits carry forward.
- [ ] Promotion runs the full biometric-consent gate appropriate to the Persona kind (Baby = Guardian; Adult = self liveness), not the light Character checkpoint.
- [ ] Promotion kicks off LoRA training; the Persona follows `training → ready / failed`.
- [ ] A Character that is never promoted never acquires biometric data or a LoRA.
- [ ] Tested at the service seam with consent/liveness/fal faked; integration-test that hard-delete of the Family removes promoted-Persona photos + LoRA weights.

## Blocked by

- 19 — Character creation via Trait Questionnaire + light consent
- (existing) 04 — Baby Persona create / 03 — Adult Persona create (full gate + training)
