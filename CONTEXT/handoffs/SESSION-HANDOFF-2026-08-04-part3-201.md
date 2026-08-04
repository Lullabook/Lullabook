# Part3 — #201 hardening

- **Ticket:** #201 / local 193
- **Commit:** `f9a98c8`
- **Status:** Debugging; parent fix complete, gate pending final branch verify.

Fixed the audit findings: Home reads are session-identity scoped; Storybook polling has a 15s abort budget; authenticated startup bypasses demo-storage reads; Story detail no longer exposes blob/provider keys or candidate content and resolves images through an authenticated opaque page route; Family now uses one virtualized SectionList instead of nested FlatLists in Screen's ScrollView. Added stale image-load cancellation and regressions.

Evidence:
- `npx vitest run tests/193-polling-startup-render.test.ts tests/149-dead-surface-sweep.test.ts` — **31/31 passed**.
- `npx tsc -p mobile/tsconfig.json --noEmit` — passed.
- Scoped ESLint and diff checks — passed.
