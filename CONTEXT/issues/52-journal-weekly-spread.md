# 52 — Journal weekly spread ("day in the life")

Triage: ready-for-agent

## What to build
The "weekly schedule / daily spread" view of the Journal: the baby's week laid out
as a daily spread, scrollable into past weeks.

- Journal gains a **weekly spread** view alongside the flat timeline: the current
  week rendered as seven day-cells (or the project's daily-spread layout), each
  showing that day's Moments.
- Past weeks are reachable by scrolling/paging back; empty days render quietly.
- **Significant Moments** are pinned/highlighted in the spread.
- A reusable `groupMomentsByWeek(babyId, weekOf)` helper (or equivalent) that
  buckets a Baby's Moments into day/week groups — this grouping is reused by the
  Weekly Story suggestion (issue 55).
- Uses the existing v2 design system; no new visual design authored here.

## Acceptance criteria
- The Journal shows the current week as a daily spread with each day's Moments in
  place; significant Moments stand out.
- The parent can navigate to previous weeks; weeks with no Moments render an empty
  state, not an error.
- The week-grouping logic is unit-tested (boundaries: week start/end, timezone of
  `occurred_on`, empty weeks) and exported for reuse.

## Blocked by
50 (Moment capture + Journal timeline)
