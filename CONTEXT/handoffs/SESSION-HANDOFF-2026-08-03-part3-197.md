# Session Handoff — Part3 #197

- **Ticket:** #197 / local issue 189 — Enforce the exact 12-Page Story contract and deterministic placeholder art
- **Stage:** Debugging → Grader Ready
- **Hardening commit:** `e573fcf`
- **Builder baseline:** `d171dde`

## Debug result

Luna max red-team fixed the Story contract gaps:

- Exact 12-page R1 enforcement now applies to default R1 as well as the explicit one-plan flag.
- Finalization and watchdog promotion validate the complete sequential page set and selected blob presence.
- Rerolls are draft-only, deterministic, idempotent, budget-safe, and restore a failed page to ready after successful selection.
- Placeholder art has deterministic valid formats and correct SVG/PNG MIME serving; no photos, LoRA keys, provider URLs, or likeness data enter the placeholder path.
- Per-Scene Persona selection is preserved rather than replaced by the full cast.
- Async finalization and reroll request routes carry the durable behavior and idempotency boundary.

## Evidence

```text
npx vitest run tests/189-placeholder-art-story-contract.test.ts tests/189-r1-twelve-page-validation.integration.test.ts
Test Files 2 passed (2)
Tests 43 passed (43)

npx vitest run tests/162-story-generation-placeholder-draft.test.ts
Tests 13 passed (13)
```

Parent combined check: **56 tests passed**. Scoped ESLint and `git diff --check` passed. Broad verify remains a shared-tree gate and must be rerun on the settled tree; unrelated later-wave dirty paths were not staged here.

## Scope

Only these paths were staged in `e573fcf`:

- `src/app/api/images/route.ts`
- `src/app/api/local-blob/route.ts`
- `src/app/api/storybooks/[id]/finalize/route.ts`
- `src/app/api/storybooks/pages/[pageId]/reroll-image/route.ts`
- `src/lib/placeholder-art.ts`
- `src/services/storybook.ts`
- `tests/189-placeholder-art-story-contract.test.ts`
- `tests/189-r1-twelve-page-validation.integration.test.ts`

Unrelated dirty paths were preserved and not staged.
