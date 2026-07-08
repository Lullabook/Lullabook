# Session Handoff — 2026-06-14 — Local dev workflow, family UX, Daily Life

Status: historical

Shipped `LocalDevWorkflowAdapter` (storybook/persona jobs run inline on `persist()` when
`INNGEST_EVENT_KEY` is unset), family/character-add UX fixes (form races, gates, error
surfacing), the "Daily Life" rename + responsive layout, editable routine persisted on
`Baby.dailyRoutine` (migration `010_baby_daily_routine.sql`), Playwright smoke + hermes
subagent.

- Binding: Inngest is optional locally — the workflow adapter falls back to inline execution when `INNGEST_EVENT_KEY` is unset.
- Binding: made-up Characters create at `/characters/new` (free); Personas at `/personas/new` (paid); free users redirect off `/personas/new`.
- Binding: nav/page name is "Daily Life"; routine lives on `Baby.dailyRoutine`.

(condensed 2026-07-07 — full text in git history)
