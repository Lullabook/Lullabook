# 64 — Baby `birthDate` field + migration

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
A Baby gains an optional **`birthDate`**, captured at create and editable later, so the
[Birthday Story](../CONTEXT.md) offer (issue 68) has a date to fire on. This is the
cheapest slice and unblocks birthday.

- Add `birthDate` (date, nullable) to the `Baby` domain type and the data store, with a
  migration for the Supabase `babies` table.
- Surface a date input in the Baby create/edit flow (web). No behavior depends on it yet
  beyond persistence and display of the captured value.
- `BabyService` accepts and persists `birthDate`; existing babies with no date keep
  working (null is valid).

## Acceptance criteria
- [ ] A Baby can be created and edited with a `birthDate`; the value round-trips through
      `BabyService` and the store.
- [ ] Migration adds the column; existing babies load with `birthDate = null` and nothing
      breaks.
- [ ] `BabyService` tests cover create-with-date, edit-date, and null-date.
- [ ] All existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): create/edit a Baby with a birthday
      locally and confirm it persists across a restart.

## Blocked by
None - can start immediately
