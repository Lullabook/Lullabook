# 08 — Multi-Persona composition (sequential inpaint + fallback)

- Type: HITL (composition quality gate) · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0005

## What to build

Support Pages featuring more than one Persona (e.g. baby + parent). Use
**sequential per-face inpainting** (generate the Scene, then inpaint each face
region with its own Persona LoRA) rather than naive simultaneous multi-LoRA. If a
build-time quality gate fails its bar (target ~8/10 two-person scenes hold both
identities without re-roll), multi-Persona Pages fall back to a reference-image
model (Gemini 2.5 Flash Image); single-Persona Pages stay on the LoRA path.

## Acceptance criteria

- [ ] A Brief with two starring Personas produces Pages rendering both identities.
- [ ] The render path is selectable per Page based on persona count (LoRA-inpaint vs reference model).
- [ ] A spike harness evaluates composition quality against the gate bar (HITL judgment).
- [ ] If the gate fails, the reference-model fallback is used for multi-Persona Pages.
- [ ] Service-seam tests with both render adapters faked.

## Blocked by

- 06 — Generate Storybook (single-persona)
