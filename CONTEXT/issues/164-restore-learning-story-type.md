# 164 — Restore the Learning story type (un-cut)

Triage: ready-for-agent

## Parent
PRD v19 — `CONTEXT/planning/prd-v19-working-core-loop.md`, per
[ADR-0026](../docs/adr/0026-restore-journal-and-learning-uncut-r1.md). The `learning` type
already exists end-to-end (labels, `storyType` plumbing, `anthropic.generateStory`); this
un-cuts it and gives it a role-correct symbol.

## What to build
1. **Flip the gate (I3.2).** Set `EXPO_PUBLIC_R1_STORY_TYPES_ENABLED=true` in the mobile env
   surfaces so `isR1MultiStoryTypeEnabled()` (`mobile/lib/r1-flags.ts:26`) returns the full
   `ALL_STORY_TYPES`, and confirm the server side has no counterpart gate blocking a
   `learning` Brief (`src/lib/r1-config.ts`). Both must agree — no reachable type whose
   generation path is gated off.
2. **Role-correct symbol.** Replace the placeholder `🌟` for Learning
   (`mobile/app/(tabs)/create/index.tsx:14`) with a meaningful, canon symbol distinct from
   Bedtime's `🌙` (coordinate with issue 166's iconography pass so the two share a system —
   e.g. Bedtime `🌙`, Learning `🎓`/`📚`). Both must be legible on the Create pill.
3. **Both-types generation.** The Learning Brief flows through `generate()` →
   `anthropic.generateStory({ storyType: "learning" })` and produces a viewable book on the
   same placeholder-art path as issue 162.

## Acceptance criteria
- [ ] With the flag on, the Create screen shows **both** Bedtime and Learning; with it off,
      Bedtime only (the cut stays reversible).
- [ ] I3.2: mobile flag + server gate agree — a `learning` Brief is never rejected by a
      lingering server cut.
- [ ] A `learning` Brief generates a viewable draft (rides issue 162's pipeline).
- [ ] Symbol is role-correct and distinct from Bedtime; design-check passes.
- [ ] Mobile typecheck clean; existing suite green.

## Verification-command
```bash
npx vitest run tests/164-learning-story-type.test.ts && npm run verify
```

## Blocked by
162
