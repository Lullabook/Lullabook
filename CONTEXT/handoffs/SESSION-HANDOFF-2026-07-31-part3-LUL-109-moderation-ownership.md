# Debugger handoff — LUL-109 moderation ownership

**Date:** 2026-07-31
**Branch:** `worktree-debugging`
**Tracker:** Linear is canonical; GitHub Issues Sync is enabled, so no GitHub Issue or label was changed.

## LUL-109 — RLS isolation and Hard-delete

### Grader bounce defect

Production Page moderation evidence used identifiers such as `<storybookId>/page-N`. The prior hard-delete inferred ownership only from older identifiers and could preserve those moderation records. More critically, moderation evidence had no durable `family_id`; a Family-owned deletion could not reliably synchronize through Supabase or prove its database boundary under an authenticated PostgreSQL principal.

### Repair

- Added migration `023_moderation_audit_family_ownership.sql`:
  - `moderation_audit.family_id` references `families(id)` with `ON DELETE CASCADE`.
  - Backfills known legacy member, Persona, Character, Storybook/Page, and candidate identifier shapes.
  - Leaves un-attributable legacy rows service-only rather than guessing a Family owner.
  - Enforces ownership for new or changed rows.
- Threaded the authenticated Family ID through every active moderation write boundary.
- Hydrates and snapshots Family moderation evidence in `SupabaseDataStore`; hard-delete now propagates durable moderation-row deletion.
- Made explicit `familyId` authoritative. Legacy `resourceId` inference now applies only to unowned historical records, preventing another Family’s colliding row from being erased.
- Corrected hard-delete inventory/deletion counts for Family, members, moderation evidence, and Family-scoped provider kill switches.
- Added regressions for production Page identifiers, cross-Family collisions, Supabase restart persistence, authenticated PostgreSQL isolation, cascade deletion, and accurate inventory counts.

### Verification

Passed:

```bash
npx vitest run tests/184-provider-artifact-delete-rls.test.ts tests/184-supabase-artifact-inventory.integration.test.ts tests/184-hard-delete-restart.integration.test.ts tests/184-authenticated-rls.integration.test.ts
```

Result: **4 files / 7 tests passed**.

Also passed after installing lockfile-pinned mobile dependencies:

- root TypeScript check
- mobile TypeScript check
- full Vitest suite
- Sentry automation check
- dead-surface sweep
- deterministic seed check
- scoped ESLint: 0 errors; one pre-existing unused-variable warning in `src/services/storybook.ts:892`

`npm run verify` remains nonzero only because Playwright's automatically started `dev:free` server did not complete before its 120-second startup timeout. This is test-infrastructure/dev-server startup behavior, not a LUL-109 test or type failure. A direct `npx playwright test` was stopped after it exceeded three minutes; no product claim is based on it.

### Live-provider safety boundary

No paid provider command ran:

```text
DO NOT RUN: LIVE_PROVIDER_BUDGET_USD=10 npm run smoke:provider-bakeoff
DO NOT RUN: LIVE_PROVIDER_BUDGET_USD=2 npm run smoke:r1-provider-e2e
```

### Sentry → GitHub Issue Link setup

Account owner must configure Sentry's GitHub integration and create an Issue Alert rule that uses **Issue Link** for `VrajGupta/Lullabook`. Keep `SENTRY_DSN` configured as an environment variable; never expose `SENTRY_AUTH_TOKEN` to the client. The `beforeSend` scrubber and mobile `attachScreenshot: false` protect child/Family data before an error can reach Sentry or GitHub.

### Next review

Independent grading should verify migration 023 against a production-like PostgreSQL schema and judge LUL-109 from its ticket evidence. Preserve the debugging worktree; it was intentionally retained at the user's request.
