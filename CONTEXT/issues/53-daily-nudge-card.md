# 53 — Daily nudge card (in-app)

Triage: ready-for-agent

## What to build
The daily capture habit on the World home — without forcing a schedule.

- A **"What happened today?"** card on the World home for the selected Baby that
  deep-links into the Moment capture form (issue 50).
- Shows **at most once per day per Baby**: once a Moment is logged today (or the
  card is dismissed), it stops nagging until the next day. Track last-shown /
  last-logged per Baby.
- Capture stays free-form — the card is an invitation, never a blocker; dismissing
  it never prevents logging from the Journal.
- Web/in-app only in this issue; native push is issue 56.
- Uses the existing v2 design system.

## Acceptance criteria
- On a day with no Moment yet, the World home shows the nudge card for the selected
  Baby; tapping it opens capture with today's date pre-filled.
- After logging a Moment today (or dismissing), the card does not reappear until the
  next day.
- The nudge is per-Baby (switching babies re-evaluates independently).
- Tests cover the once-per-day show/suppress logic across the day boundary.

## Blocked by
50 (Moment capture + Journal timeline)
