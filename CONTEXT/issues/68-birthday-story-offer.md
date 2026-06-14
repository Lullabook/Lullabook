# 68 — Birthday Story offer (web)

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
A calendar-triggered **[Birthday Story](../CONTEXT.md)** offer. Using the Baby's
`birthDate` (issue 64), the World surfaces a "Make [Baby]'s birthday story" offer on/near
the birthday. Same suggestion contract — offer → confirm [Story Type](../CONTEXT.md) →
generate; never silent. **Holidays / jurisdiction calendar are out of scope.**

- Extend the suggestion seam so, given a Baby with a `birthDate` and an injected clock, it
  returns a birthday offer within a defined window around the date.
- Surface the offer on the World home (alongside the existing daily/weekly cards).
- The offer assembles a suggested [Brief](../CONTEXT.md) (the Baby stars; theme seeded as a
  birthday); the parent confirms before any spend.

## Acceptance criteria
- [ ] With a Baby whose `birthDate` is within the offer window (clock injected), a birthday
      offer is returned; outside the window, none is.
- [ ] A Baby with no `birthDate` produces no birthday offer and no errors.
- [ ] The offer never triggers generation without an explicit parent confirm.
- [ ] Service tests cover in-window, out-of-window, and null-date, with a deterministic
      injected clock. All existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): set a Baby's birthday to today
      locally, accept the offer, and generate a real Story.

## Blocked by
- 64
