# 76 — Mobile Firsts view + inline "Make this a Story" offer

Triage: ready-for-agent

## What to build
The Firsts thread on device: a filtered Journal view of the Baby's `first`/milestone
Moments, with the inline offer that funnels into the mobile Storybook create flow.

- Firsts view: filter the issue-75 timeline to `momentType === "first"` (and milestone),
  reachable from the Journal/Daily screen (tab, segment, or filter chip — kit components).
- Inline offer: each first shows a "✨ Make this a Story" action that routes into the
  Storybook create flow (issue 78) with the Moment **pre-seeding the Brief/theme**.
- Preserve the suggestion contract: the offer opens the create flow where the parent
  **confirms Story Type before any generation spend** — never silent generation.
- Reuse the offer copy/contract already used by the web Firsts/Weekly suggestion.

## Acceptance criteria
- The Firsts view shows only the Baby's first/milestone Moments.
- Taking the offer opens the Storybook create flow with the Moment text seeded; the
  parent must still confirm Story Type before generating.
- No generation is triggered by merely viewing/opening the offer.
- Manual Simulator pass recorded in the handoff.

## Blocked by
75, 78
