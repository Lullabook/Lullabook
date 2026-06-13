# 32 — Persist `push_subscriptions` + `email_plus_vpc_requests` (migration 003 + real store + hard-delete + CI smoke)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v4 — Production persistence](../planning/prd-v4-production-persistence.md)
- Implementer: Cursor Composer 2.5 / Antigravity, TDD

## What to build

Close the only in-memory-vs-persisted gap in the data store. Add migration `003`
creating the two tables the native iOS work left in-memory, wire **both** into the
real `SupabaseDataStore` so it behaves identically to the in-memory store, make
**hard-delete** erase them with the rest of a Family's data, and add a CI step that
proves the migrations apply cleanly.

- **`push_subscriptions`**: `id`, `member_id` (FK → members), `expo_push_token`,
  `created_at`. **No `family_id`** (member-scoped). RLS: a Member may
  select/insert/delete **only their own** rows (`member_id` = their Member id); the
  backend service role sends family-wide and hard-deletes.
- **`email_plus_vpc_requests`**: `id`, `family_id` (FK → families), `member_id`,
  `email`, `status` (`requested | link_sent | confirmed | revoked`), `token`,
  `notice_version`, `requested_at`, `confirmed_at?`. RLS mirrors `consent_receipts`
  (visible within Family, Guardian inserts/updates); the secret `token` is resolved
  **server-side only**, never via a client RLS read.
- `SupabaseDataStore` loads both on hydration and upserts/deletes them in `sync()`
  using the existing batched (`Promise.all`) write path — no per-row serial
  round-trips.
- `hardDeleteFamily` (real store) deletes `email_plus_vpc_requests` by `family_id`
  and `push_subscriptions` by `member_id in (select id from members where
  family_id = $1)`; `sync()` must not re-upsert the deleted rows.

## Acceptance criteria

- [ ] Migration `003` creates both tables with RLS enabled, additive on top of a
      DB already at `002`; `push_subscriptions` is member-scoped, `email_plus_vpc_requests`
      mirrors `consent_receipts` RLS.
- [ ] `SupabaseDataStore` reads + `sync()`s both tables identically to the
      in-memory store (parity asserted through the `DataStore` interface).
- [ ] A Member can see/manage only their own device tokens (simulated RLS,
      mirroring `01-walking-skeleton`); a VPC request is visible within its Family
      and not across Families; the token is not exposed by a Family-scoped read.
- [ ] **Hard-delete** erases a Family's push tokens (via the members subquery) and
      VPC requests, and a subsequent `sync()` does **not** re-write them (extend
      `tests/12-hard-delete.test.ts`).
- [ ] A **CI job** applies all migrations (`001` → `003`) to a throwaway Postgres
      from scratch and fails the build on any SQL/policy error.
- [ ] All existing tests stay green; `npx tsc --noEmit` + lint clean.

## Blocked by

None — can start immediately.
