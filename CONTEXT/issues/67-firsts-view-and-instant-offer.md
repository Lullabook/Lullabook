# 67 — Firsts view + instant "Make this a Story" offer (web)

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
A dedicated **[Firsts](../CONTEXT.md)** surface and an **immediate** story offer. The
`momentType` of `milestone`/`first` already exists (`moment.ts`); this slice gives those
Moments their own filtered [Journal](../CONTEXT.md) view and offers a Story the moment a
parent logs a first — distinct from the once-a-week
[Weekly Story suggestion](../CONTEXT.md).

- A "Firsts" view: the Journal filtered to milestone/`first` Moments.
- On logging a "first" Moment, surface an inline "Make [Baby]'s [first] into a story" CTA.
- Reuses the existing suggestion contract: the offer assembles a suggested
  [Brief](../CONTEXT.md); the parent confirms [Story Type](../CONTEXT.md) before any
  generation spend. **Never silent.**
- Extend `JournalNudgeService` (or the suggestion seam) so the offer is computed
  deterministically from a Baby + its Moments.

## Acceptance criteria
- [ ] A "Firsts" view lists only milestone/`first` Moments for the Baby.
- [ ] Logging a "first" produces an immediate inline Story offer, separate from the weekly
      card.
- [ ] The offer never triggers generation without an explicit parent confirm of Story Type.
- [ ] Service tests cover: firsts filtering, instant-offer presence on a first, and no
      silent spend. All existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): log a first locally, accept the
      offer, and generate a real Story.

## Blocked by
None - can start immediately
