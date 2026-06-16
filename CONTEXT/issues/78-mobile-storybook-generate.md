# 78 — Mobile Storybook generation (Brief flow → generate → poll)

Triage: ready-for-agent

## What to build
The native create path: a parent assembles a Brief and generates an illustrated
Storybook, watching it move through `generating → draft`.

- Brief flow (Maya's World kit): pick starring cast (Baby + roster/Characters), choose
  **Story Type** (Bedtime/Learning), enter a theme, optional free-text note. Accept a
  pre-seeded theme param from the Firsts offer (issue 76) and the existing Daily
  "Turn into a story" button.
- Submit → `createStorybook(brief)` (issue 77) → navigate to a status screen that polls
  `getStorybook(id)` until `draft`/`failed`, with kit loading/skeleton states.
- Gate: in the Simulator the dev-forced subscription unlocks generation; if inactive,
  show the existing "subscription required" state (no paywall UI built this wave).
- Failed generation surfaces as a re-rollable/ retry state, not a dead end.

## Acceptance criteria
- From the create flow a parent can generate a Storybook on the Simulator and see it
  reach `draft`; a Firsts/Daily offer pre-seeds the theme.
- Story Type is confirmed in-flow before generation (suggestion contract).
- Status polling reflects real lifecycle; failure is recoverable.
- Manual Simulator pass recorded in the handoff (HITL — real pipeline run).

## Blocked by
77
