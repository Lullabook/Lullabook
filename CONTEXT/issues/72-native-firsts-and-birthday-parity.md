# 72 — Native iOS parity: Firsts + Birthday offers

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
Port the two calendar/engagement features to the iOS app. The [Firsts](../CONTEXT.md) view
and instant offer (issue 67) and the [Birthday Story](../CONTEXT.md) offer (issue 68) appear
natively, reusing the same backend suggestion seam — no mobile-specific suggestion logic.

- A native "Firsts" view (Journal filtered to milestone/`first` Moments) with the inline
  instant Story offer.
- The Birthday Story offer surfaces in the native World home, like the existing
  daily/weekly cards.
- Both reuse the same offer endpoints; the parent confirms [Story Type](../CONTEXT.md)
  before any spend; never silent. Native push for these offers is **out of scope** here
  (rides existing push infra only if trivial).

## Acceptance criteria
- [ ] The iOS app shows a Firsts view and an instant Story offer on logging a first.
- [ ] The iOS app surfaces a Birthday Story offer within the birthday window.
- [ ] Neither offer triggers generation without an explicit parent confirm.
- [ ] Mobile tests / smoke cover both offers. Existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): exercise both offers on iOS and
      generate a real Story from each.

## Blocked by
- 67
- 68
