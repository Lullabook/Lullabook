# Session Handoff — 2026-06-13 (issue 32): persist push + Email-Plus VPC tables

> Implementation session (`/part2`). Completed **issue 32** — migration `003`,
> `SupabaseDataStore` hydrate/sync for `push_subscriptions` and
> `email_plus_vpc_requests`, simulated RLS read paths, hard-delete propagation
> via `sync()`, and CI migration smoke-check. **127 tests green.**

## Issue completed

**`32`** — Persist `push_subscriptions` + `email_plus_vpc_requests`
(`CONTEXT/issues/32-persist-push-and-vpc-tables.md`)

## What was built

1. **`supabase/migrations/003_push_and_email_plus_vpc.sql`**
   - `push_subscriptions`: member-scoped RLS (`member_id = app_current_member_id()`).
   - `email_plus_vpc_requests`: Family-scoped select; Guardian insert/update (mirrors
     `consent_receipts`).

2. **`SupabaseDataStore`** (`src/db/supabase-store.ts`)
   - Hydrates both tables on `hydrateFamily()` (push via `member_id in (...)`).
   - Upserts/deletes both in batched `sync()`; deletes run before members (FK order).

3. **Simulated RLS read paths** on `DataStore` (`src/db/store.ts`)
   - `getPushSubscriptionsForMember(target, actor)` — member-scoped.
   - `getEmailPlusVpcRequestsForFamily(familyId, actor)` — Family-scoped, **omits
     `token`**.

4. **Tests** — `tests/32-persist-push-vpc.test.ts` (5 cases): RLS parity, Supabase
   hydrate/sync, hard-delete + second `sync()` does not re-upsert.

5. **CI** — `tools/migration-smoke.sh` + `migration-smoke` job in
   `.github/workflows/ci.yml` (Postgres 16 service, applies `001`→`003`).

## Test state

- `npm test` — **127 passed** (was 116 + existing deltas; +5 from issue 32).
- Kaizen coach — green (tests + build).
- `npx tsc --noEmit` — pre-existing errors in tests 03/06/21/23 (Inngest private
  `fn`, bearer context typing); **not introduced by this slice**.
- `npm run lint` — pre-existing mobile + test `any` warnings; new files clean.

## Honest follow-ups

- **Issue 33** (Email-Plus VPC revoke withdraws consent) is **next and unblocked**
  now that tables persist — single-use confirm, revoke clears
  `consent_verified`, blocks Baby Persona, routes to purge path.
- **Real Postgres RLS assertion harness** still deferred (PRD v4 out-of-scope).
- **`token` column** is in the migration table; Family-scoped client reads must
  use `getEmailPlusVpcRequestsForFamily` (no token). Confirm/revoke stay
  service-role server-side.
- **8 web shared-service bugs** — still pending; see
  `docs/ANTIGRAVITY-WEB-BUGFIX-PROMPT.md`.

## Next ready issue

**`33`** — Email-Plus VPC revoke withdraws consent
(`CONTEXT/issues/33-email-plus-vpc-revoke-withdraws-consent.md`). Blocked-by 32
is satisfied.

## Suggested skills for the next session

- **`/part2`** — picks issue `33` automatically.
- **`/tdd`** — revoke state machine at VPC/consent-engine seam.
- **`/handoff`** + **`/push-handoff`** — at session end.

## Key refs

- PRD: `CONTEXT/planning/prd-v4-production-persistence.md`
- ADRs: 0007 (hard-delete), 0011 (RLS store), 0018 (Email-Plus VPC)
- Prior handoff: `SESSION-HANDOFF-2026-06-13-persistence.md` (planning)
