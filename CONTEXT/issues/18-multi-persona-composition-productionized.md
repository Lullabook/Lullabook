# 18 — Multi-Persona composition, productionized

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0005, ADR-0012, ADR-0002
- Glossary: Scene, Persona, Style Bible

## What to build

Wire the multi-Persona composition path chosen by the spike (issue 17) into the
real generation workflow. A Page whose Scene includes more than one Persona
generates via the chosen default (sequential per-face inpaint, each face using
that Persona's `loraWeightKey`), falling back to the reference-model path under
the spike-defined conditions, behind the existing composition gate. The Page
flows through the same moderate-bytes → blob-store → blob-key path and the same
per-Page isolation/idempotency guarantees as single-Persona Pages.

## Acceptance criteria

- [ ] A Page with 2+ Personas composes them into one illustration via the chosen default path.
- [ ] The reference-model fallback engages under the spike-defined conditions, behind the gate.
- [ ] Multi-Persona Pages honor the Style Bible and the same moderation-before-store, blob-key, isolation, and idempotency rules as single-Persona Pages.
- [ ] Tested at the service seam with fal.ai faked (inpaint + reference-model paths); a faked composition failure isolates that Page without sinking the book.

## Blocked by

- 17 — Multi-Persona composition spike (quality gate)
