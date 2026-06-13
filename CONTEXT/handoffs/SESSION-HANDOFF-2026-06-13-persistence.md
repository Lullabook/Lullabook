# Session Handoff — 2026-06-13 (persistence): PRD v4 + issues 32–33

> Planning session (`/part1` run #2). **No app code changed.** Grilled the
> "production persistence" effort and produced PRD v4 + two issues for the
> next implementer (Cursor / Antigravity, TDD). Also created two global
> orchestrator skills and the Antigravity bug-fix prompt. Branch unchanged:
> `handoff/generation-pipeline-prd-v2`.

## What happened this session

1. Ran **`/part1`** (grill-with-docs → to-prd → to-issues → handoff → push-handoff).
2. **Grill subject:** the two tables the native iOS work left in-memory —
   `push_subscriptions` and `email_plus_vpc_requests`. Verified they are the
   **only** in-memory-vs-persisted gap (cross-checked all 21 maps in `store.ts`
   against migration `002` — every other map has a table).
3. **Key finding:** the suite's "RLS integration test" runs against the
   `InMemoryDataStore`'s *simulated* RLS (`RlsViolationError`); **no real Postgres
   is exercised by any test** (no `DATABASE_URL`, no supabase-local, no
   pglite/testcontainers). So the real migration RLS is only verified by deploy.
4. Wrote **`CONTEXT/planning/prd-v4-production-persistence.md`** and issues
   **`32`–`33`** in `CONTEXT/issues/`.
5. Updated the **Email-Plus VPC** glossary entry in `CONTEXT/CONTEXT.md` (revoke
   withdraws consent).
6. **Skills/tooling created this session:**
   - **Global `/part1`** (`~/.claude/skills/part1/`) — planning chain.
   - **Global `/part2`** (`~/.claude/skills/part2/`) — implementation chain
     (read docs → pick next unblocked issue → tdd → handoff → push-handoff).
   - **`docs/ANTIGRAVITY-WEB-BUGFIX-PROMPT.md`** — verify-then-fix runbook for the
     8 web shared-service bugs, for the Antigravity agent post-Cursor.

## Locked decisions (full detail in PRD v4)

1. **Test strategy:** keep the fast in-memory simulated-RLS behavioral tests; add
   migration `003`; add a **CI migration smoke-check** (apply `001`→`003` to a
   throwaway Postgres). **Defer** a full real-Postgres RLS-assertion harness.
2. **RLS/schema:** `push_subscriptions` **member-scoped** (no `family_id`;
   hard-delete via `member_id in (select id from members where family_id=$1)`;
   backend family-wide send via service role). `email_plus_vpc_requests`
   **Family-scoped + Guardian-managed** (mirror `consent_receipts`); secret `token`
   resolved **server-side only**.
3. **VPC lifecycle:** request row persists as audit; confirm token single-use;
   **revoke** always-available → clears Family `consent_verified`, blocks new Baby
   Persona, routes existing child data to the **existing** ADR-0007 purge path (no
   new auto-purge pipeline). Both tables erased on Family hard-delete.

## Issues produced

- **`32`** — persist both tables: migration `003` + RLS + `SupabaseDataStore.sync()`
  wiring + hard-delete propagation + CI migration smoke-check. **Unblocked.**
- **`33`** — Email-Plus VPC revoke withdraws consent (single-use confirm,
  revoke clears consent_verified + blocks + purge route). **Blocked by 32.**

## Context for the next agent

- Current code state: the native build landed at commit `c2750d9` (116 tests).
- The 8 web shared-service bugs are still pending — covered by Cursor's native
  issues (folded in) and/or the Antigravity prompt. Issue `32`'s hard-delete work
  overlaps the bug-2 (hard-delete completeness) fix on the **real** store.
- There are now **three** 2026-06-13 handoffs: the native-planning one
  (`SESSION-HANDOFF-2026-06-13.md`), Cursor's build one
  (`SESSION-HANDOFF-2026-06-13-native-ios.md`), and this persistence one.

## First moves for the next agent

1. Read `CONTEXT/planning/prd-v4-production-persistence.md` + `CONTEXT/CONTEXT.md`
   (Email-Plus VPC, Hard-delete) + ADR-0011/0007.
2. Run **`/part2`** → it should pick **issue `32`** (lowest unblocked), build it
   TDD, then `33`.

## Suggested skills for the next session

- `/part2` — the implementation chain; will select issue `32`.
- `/tdd` — invoked inside `/part2`.
- `/handoff` + `/push-handoff` — at session end (inside `/part2`).
