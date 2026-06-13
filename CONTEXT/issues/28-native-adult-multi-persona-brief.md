# 28 — Adult / multi-Persona + Brief composer

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

Richer casting and direction. A Member creates their own **Adult Persona** via
native **selfie + liveness** (their own likeness — no Guardian/VPC gate), and a
parent directs books through a native **Brief composer** (starring Personas, Story
Type, theme, setting, optional moderated note). Multi-Persona Pages (baby +
grandparent) use the existing sequential-inpaint / ref-model path behind its gate
(ADR-0005). Reuses existing services through Bearer routes.

## Acceptance criteria

- [ ] A Member can create an **Adult Persona** with native **selfie capture +
      liveness** consent; no Email-Plus VPC required (own likeness).
- [ ] A native **Brief composer** captures starring Personas, **Story Type**,
      theme, setting, and an optional **moderated** custom note; submitting feeds
      the existing generation pipeline.
- [ ] A **multi-Persona** Page uses sequential-inpaint with ref-model fallback
      behind the existing `useReferenceModelForMulti` gate; baby + co-star appear
      together coherently.
- [ ] Custom Brief notes pass the same moderation rails as web (ADR-0010).
- [ ] Tested at the service seam with liveness, Anthropic, and fal faked; prior art
      `03-adult-persona`, `08-multi-persona-composition`, `06-generate-storybook`.

## Blocked by

- [26 — Email-Plus VPC + Baby Persona + first illustrated Storybook](./26-native-email-plus-vpc-baby-persona.md)
