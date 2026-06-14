# 66 — Photo-derived scene description seeds story-from-Moment

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
Make the photo actually shape the Story. When a [Moment](../CONTEXT.md) carrying a photo is
turned into a Story, its **scene description** flows into the
[Brief](../CONTEXT.md)/[auto-context layer](../CONTEXT.md) that conditions generation —
**text only**, per [ADR-0021](../docs/adr/0021-moment-photos-write-only-vision-to-text.md).
Pixels never condition the illustration; likeness (LoRA) and Style Bible are unchanged.

- The existing create-Story-from-Moment path includes the photo's scene description in the
  prompt context for a Moment that has one.
- Generation otherwise proceeds normally (per-persona LoRA + Style Bible). Determinism /
  idempotency per attempt holds (issue 16).

## Acceptance criteria
- [ ] A Story generated from a photo-bearing Moment includes that Moment's scene
      description in the Brief/auto-context that reaches the prompt.
- [ ] A Story from a photo-less Moment is unchanged from today's behavior.
- [ ] The photo's pixels are never sent to the illustration pipeline (text only).
- [ ] `StorybookService` tests assert the scene description is present in generation context
      when (and only when) a photo Moment is used. All existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): generate a real Story from a
      photo Moment and confirm the story reflects the photo's scene.

## Blocked by
- 65
