# PRD v4 — Production persistence for `push_subscriptions` + `email_plus_vpc_requests`

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](./prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5 / Antigravity, TDD.
- Refs (ADRs): [0011](../docs/adr/0011-backend-architecture.md) (backend
  architecture / data store), [0007](../docs/adr/0007-data-lifecycle-and-deletion.md)
  (hard-delete / purge), [0018](../docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md)
  (Email-Plus VPC), [0015](../docs/adr/0015-multi-jurisdiction-launch.md) (consent
  config).
- Glossary terms: Email-Plus VPC, Hard-delete, Family, Member, Guardian, Consent
  receipt, Subscription.
- Source: the `grill-with-docs` session of 2026-06-13.

## Problem Statement

The native iOS work (PRD v3) added two pieces of state — device **push tokens**
and the **Email-Plus VPC** consent state machine — but only as in-memory maps
(`store.ts`: `pushSubscriptions`, `emailPlusVpcRequests`). They have **no
migration table** and `SupabaseDataStore` does **not** persist them (verified:
migration `002` covers the other ~19 tables; these two appear nowhere in the
migrations or the real store). So in production: push tokens evaporate on restart
(no "Persona ready" / "Storybook ready" notifications survive), and a Guardian's
parental-consent record and revoke capability are not durable — which is both a
broken feature and a **COPPA/erasure liability**, since consent must be provable
and revocable and child data must be hard-deletable.

These two are the **only** in-memory-vs-persisted gap; every other domain map maps
to a persisted, RLS-protected table.

## Solution

Add migration **`003`** creating `push_subscriptions` and
`email_plus_vpc_requests` with row-level security, and wire **both** into the real
`SupabaseDataStore` (read on load, upsert/delete on `sync()`) so the two stores
behave identically. Propagate **hard-delete** to both tables so a Family's tokens
and consent requests are erased with the rest of its data (ADR-0007). Make the
Email-Plus VPC **revoke** path durable: a Guardian can withdraw consent at any
time, which clears the Family's `consent_verified`, blocks new Baby Persona
creation, and routes existing child data to the standard purge path.

Keep the fast in-memory simulated-RLS behavioral tests (the project's existing
pattern), and add a cheap **CI migration smoke-check** that applies all migrations
to a throwaway Postgres so SQL/policy errors are caught on every push — without
standing up a full real-Postgres RLS-assertion harness (deferred as its own
effort).

## User Stories

1. As a parent, I want my device's push token to survive server restarts and
   redeploys, so that I keep receiving "Persona ready" / "Storybook ready"
   notifications.
2. As a parent on multiple devices, I want each device's push token stored
   independently, so that notifications reach all my devices.
3. As a Member, I want to read/manage only **my own** device tokens, so that one
   Member can't see or delete another Member's devices.
4. As the platform, I want to send a notification to **every** device token in a
   Family (via the backend service role), so that family-shared events reach all
   relevant Members.
5. As a Guardian, I want my Email-Plus VPC consent request stored durably, so that
   my parental consent is provable across restarts and to which notice version it
   applied.
6. As a Guardian, I want the consent **confirm** link to work exactly once
   (single-use token), so that a leaked or replayed link can't re-confirm.
7. As a Guardian, I want a **revoke** link that stays available after confirmation,
   so that I can withdraw consent at any time (COPPA).
8. As a Guardian, when I revoke consent I want the Family's `consent_verified`
   cleared, so that **no new Baby Persona** can be created until I re-consent.
9. As a Guardian, when I revoke consent I want my child's existing data routed to
   the standard hard-delete/purge path, so that withdrawal actually removes the
   likeness (ADR-0007).
10. As a Member of a Family, I want consent requests visible **within my Family**
    but not across Families, so that another Family can never see our consent
    state or token.
11. As the platform, I want the secret consent/revoke **token** resolved only
    server-side (service role), never exposed through a client RLS read, so that
    capability tokens don't leak.
12. As a parent exercising my right to be forgotten, I want **hard-delete** to
    erase my Family's push tokens **and** consent requests, so that nothing about
    my devices or my child's consent survives deletion.
13. As the platform, I want `sync()` to never re-write a hard-deleted Family's
    push tokens or consent requests, so that erasure is permanent (the
    sync-re-upsert bug class).
14. As a developer, I want both the in-memory and the real Supabase store to
    behave identically for these two tables, so that the fast tests stay a faithful
    spec of production.
15. As a developer, I want CI to apply all migrations to a throwaway Postgres on
    every push, so that a broken `003` (bad SQL or RLS policy) is caught before
    deploy.
16. As the platform, I want the new tables to follow the same per-Family RLS
    discipline as the existing 19 tables, so that isolation stays uniform.

## Implementation Decisions

### Migration `003` (new tables + RLS)
- **`push_subscriptions`**: columns `id`, `member_id` (FK → members),
  `expo_push_token`, `created_at`. **No `family_id`** (member-scoped by decision).
  RLS: a Member may select/insert/delete **only rows where `member_id` = their own
  Member id**. The backend service role (used for family-wide sends and hard-delete)
  bypasses RLS as it does elsewhere.
- **`email_plus_vpc_requests`**: columns `id`, `family_id` (FK → families),
  `member_id`, `email`, `status` (`requested | link_sent | confirmed | revoked`),
  `token`, `notice_version`, `requested_at`, `confirmed_at` (nullable). RLS mirrors
  `consent_receipts`: **visible within the Family**, **Guardian inserts/updates**.
  The `token` is **never** the basis of a client read — confirm/revoke lookups by
  token happen server-side via the service role.
- Enable RLS on both tables in the same migration.

### Wire `SupabaseDataStore`
- Implement load + `sync()` for both maps so the real store reads them on
  hydration and upserts/deletes them on commit, **identically** to the in-memory
  store's observable behavior. Group writes per the existing `sync()` batching
  (the `Promise.all` batching fix already applied) — do not regress to per-row
  serial round-trips.

### Hard-delete propagation (ADR-0007)
- `hardDeleteFamily` already clears `pushSubscriptions` and `emailPlusVpcRequests`
  in memory; ensure the **real** store deletes them too:
  `email_plus_vpc_requests` by `family_id`; `push_subscriptions` by
  **`member_id in (select id from members where family_id = $1)`** (the members
  subquery, since push tokens carry no `family_id`). `sync()` must not re-upsert
  the deleted rows.

### Email-Plus VPC revoke semantics
- The request row **persists permanently** as the consent audit record (paired with
  the version-stamped Consent receipt), erased only on Family hard-delete.
- **Confirm** consumes a single-use token: a second confirm attempt is rejected.
- **Revoke** is available after confirmation indefinitely (COPPA withdrawal):
  setting `status = revoked` clears the Family's `consent_verified`, which **blocks
  new Baby Persona creation** (the consent engine already gates on it), and routes
  the child's existing data to the standard hard-delete/purge path (ADR-0007) —
  this PRD does **not** add a new auto-purge-on-revoke pipeline; it reuses the
  existing purge path.

### CI migration smoke-check
- Add a CI job that spins up a throwaway Postgres (e.g. the `supabase` local
  container or a plain `postgres` service) and applies **all** migrations
  (`001` → `003`) from scratch, failing the build on any SQL or policy error. This
  is a smoke check (migrations apply cleanly), **not** a full RLS-assertion suite.

## Testing Decisions

- **Test external behavior at the store / service seam, with the in-memory store
  as the spec** — the established pattern; do not test Supabase client internals.
- **Persistence parity:** assert that creating/reading/updating a push token and a
  VPC request behaves identically through the `DataStore` interface (drive the
  in-memory store; the real store implements the same contract). Prior art: the
  existing store-backed service tests and `tests/adapters.test.ts`.
- **Member-scoped push:** assert a Member only sees/manages their own device
  tokens (simulated RLS via `RlsViolationError`, mirroring `01-walking-skeleton`).
- **Family-scoped VPC:** assert a VPC request is visible within its Family and not
  across Families; assert the token is not exposed by a Family-scoped read.
- **Confirm/revoke state machine:** assert confirm is single-use; assert revoke
  clears `consent_verified` and that the consent engine then **blocks** new Baby
  Persona creation; prior art `02-subscription-consent`, `03-adult-persona`.
- **Hard-delete propagation:** extend `tests/12-hard-delete.test.ts` to assert a
  Family's push tokens (via the members join) and VPC requests are erased and
  **not re-upserted** by a subsequent `sync()`.
- **Migration smoke (CI):** the migration-apply job is the "test" for the SQL/RLS
  policies; no per-policy vitest assertions in this effort.

## Out of Scope

- **A full real-Postgres RLS-assertion harness** (pglite / supabase-local /
  testcontainers) that executes the actual policies and retro-fits the existing 19
  tables — valuable, but its own sized effort; deferred.
- **Auto-purge-on-revoke pipeline** — revoke clears consent and blocks new
  creation; deleting existing child data uses the **existing** hard-delete/purge
  path, not a new automatic cascade.
- **Any new tables** beyond these two — there is no other in-memory-vs-persisted
  gap.
- **Push delivery/transport changes** (Expo send mechanics) and the **Email-Plus
  VPC flow UI** — those are PRD v3 / native-slice concerns; this PRD only makes
  their **state** durable and RLS-correct.

## Further Notes

- This is a small, mechanical-but-load-bearing effort: it makes the native
  feature set production-deployable and closes a COPPA/erasure liability. It pairs
  naturally with the Antigravity bug-fix pass (`docs/ANTIGRAVITY-WEB-BUGFIX-PROMPT.md`),
  which already covers the **in-memory** hard-delete completeness; this PRD extends
  that completeness to the **real** store + migration.
- Migration `003` should be additive and idempotent-safe to apply on top of a
  database already at `002`.
