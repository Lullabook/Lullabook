# 69 — Extend hard-delete to purge Moment photos

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
Keep the privacy/lifecycle invariant honest. [Moment photos](../CONTEXT.md) are retained,
write-only, Family-scoped blobs ([ADR-0021](../docs/adr/0021-moment-photos-write-only-vision-to-text.md));
hard-delete / purge (ADR-0007) must erase them with everything else Family-scoped. Because
they live under the Family-scoped key space, this should be a small extension or a
verification that the existing prefix-delete already covers them.

- Ensure the hard-delete path deletes all Moment-photo blobs for a Family (no orphaned
  biometric data after purge).
- Add an integration test proving a Moment photo blob is gone after Family hard-delete.

## Acceptance criteria
- [ ] After a Family hard-delete, no Moment-photo blob for that Family remains in the store.
- [ ] An integration test creates a Moment with a photo, hard-deletes the Family, and
      asserts the photo blob is purged.
- [ ] The derived scene-description text is also removed with the Moment record.
- [ ] All existing tests stay green.

## Blocked by
- 65
