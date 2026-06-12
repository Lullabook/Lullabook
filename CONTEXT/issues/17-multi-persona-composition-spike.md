# 17 — Multi-Persona composition spike (quality gate)

- Type: HITL · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0005, ADR-0012, ADR-0002
- Glossary: Scene, Persona, Style Bible

## What to build

A throwaway spike to settle the launch-blocking quality question in ADR-0005:
can a multi-Persona Scene (e.g. baby + grandparent in one illustration) be
composed at keepsake quality via **sequential per-face inpainting** of each
Persona's LoRA onto a base image, and where does that fail? Evaluate the
**reference-model fallback** as the alternative. Produce a go/no-go
recommendation and the chosen default path (plus the conditions under which the
fallback is used) so issue 18 can wire it with confidence.

This is HITL: it ends in a human quality review and an architectural decision,
not a merge. Capture the outcome as an update to ADR-0005 (or a new ADR) if the
decision differs from the documented default.

## Acceptance criteria

- [ ] Sample multi-Persona Scenes generated via sequential inpaint across a range of poses/counts, reviewed for likeness + coherence.
- [ ] Reference-model fallback evaluated on the same Scenes.
- [ ] A documented go/no-go: the chosen default composition path and the fallback trigger conditions.
- [ ] Findings recorded against ADR-0005 (amended or superseded) so issue 18 has a settled contract.

## Blocked by

- 15 — Durable generation spine (single-Persona, real seams)
