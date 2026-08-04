# Session Handoff — Debugger #195

- **Ticket:** #195 / local issue 187 — Publish generation progress and progressive reader state
- **Stage:** Debugging → Review Ready
- **Implementation:** `4f7991e` (`feat(reader): server-derived progress, terminal polling, typed generation errors`)
- **Hardening:** `72689fa` (`fix(reader): harden generation progress recovery`)

## Debug result

Luna max red-team found and fixed three defects in the #195 lane:

1. A five-minute watchdog timeout stopped polling permanently; retry now clears the timeout state and the polling guard explicitly resumes.
2. A cross-Family Storybook probe surfaced the store's RLS error as an uncaught 500; it now returns the same non-disclosing 404 as a missing ID.
3. Support-classified failures could render without an action; create and reader screens now expose typed navigation/support actions.

Additional hardening moved the global watchdog behind the Storybook ownership check. An unauthorized probe therefore cannot trigger reaping or mutate another Family's generation/allowance as a side effect.

## Evidence

```text
npx vitest run tests/187-generation-progress-reader.test.ts tests/187-generation-errors.integration.test.ts
Test Files 2 passed (2)
Tests 43 passed (43)

cd mobile && npx tsc --noEmit
PASS
```

Scoped ESLint returned no errors; two pre-existing warnings remain in the reader (`Image` alt-text recognition and the existing `book` hook dependency warning). `git diff --check` passed.

`npm run verify` was not rerun after this lane because the shared worktree contains concurrent, uncommitted coder-owned changes for #197/#198/#200 and its broad gate is not a trustworthy isolated signal. Re-run the ticket command after that wave settles; reviewer should judge only #195 commits/files.

## Scope boundary

Only these #195 lane files were changed in `72689fa`:

- `mobile/app/(tabs)/create/index.tsx`
- `mobile/app/(tabs)/stories/[id].tsx`
- `mobile/lib/generation-flow.ts`
- `src/app/api/storybooks/[id]/route.ts`
- `tests/187-generation-errors.integration.test.ts`
- `tests/187-generation-progress-reader.test.ts`

Unrelated dirty paths were preserved and not staged.
