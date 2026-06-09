# 0005 — Multi-Persona scenes are in v1 scope, behind a composition gate

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0002](0002-per-persona-lora.md)

## Context

ADR-0002 flagged multi-LoRA composition (baby + parent in one illustration) as
the riskiest, least-proven part of the image pipeline and recommended spiking it
early. We chose to keep **multi-Persona scenes in v1** rather than cutting to
baby-only, because "the whole family in the book" meaningfully amplifies the
core hook. That choice moves the composition spike onto the launch critical path.

## Decision

Multi-Persona scenes ship in v1, de-risked by:

1. **Build-time quality gate.** Spike multi-persona composition *before* building
   the surrounding app, against an explicit pass bar (target: ~8/10 two-person
   scenes hold both identities without a re-roll).
2. **Sequential composition technique.** Do not rely on naive simultaneous
   two-LoRA generation (prone to identity bleed). Generate the scene, then
   inpaint each face region with its own Persona LoRA, one at a time.
3. **Reference-model fallback.** If the gate fails the bar, multi-Persona Pages
   fall back to a reference-image multimodal model (Gemini 2.5 Flash Image —
   already named in ADR-0002) for reliable composition at lower likeness
   fidelity; single-Persona Pages stay on the LoRA path.

## Consequences

- Longer, riskier pre-build phase: the spike is a launch blocker.
- The image pipeline must support two render paths (LoRA inpaint vs reference
  model) selectable per Page based on persona count.

## Revisit if

- The spike fails the bar *and* the reference-model fallback quality is also
  unacceptable → fall back to baby-only single-Persona scenes for v1.
