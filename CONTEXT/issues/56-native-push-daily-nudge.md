# 56 — Native push for the daily nudge

Triage: ready-for-agent

## What to build
Extend the in-app daily nudge (issue 53) to a real reminder on native iOS, reusing
the existing push infrastructure (issue 30).

- Schedule a **once-daily** "What happened today?" push per Baby (or per Household
  with the selected Baby) through the existing push pipeline.
- Respect **quiet hours** (no overnight pings) and the once-per-day rule — if a
  Moment was already logged today, suppress that day's push.
- Tapping the push deep-links into the Moment capture form for the right Baby.
- Honor notification permission / opt-out; degrade silently when push isn't granted.
- Web is unaffected (in-app card from issue 53 only).

## Acceptance criteria
- A parent on native iOS with notifications granted receives at most one daily nudge
  push, within allowed hours, deep-linking to capture.
- No push fires on a day the parent already logged a Moment, or outside quiet hours,
  or when permission is denied.
- Scheduling/suppression logic is unit-tested independent of the device transport.

## Blocked by
53 (daily nudge card), 30 (native push infra)
