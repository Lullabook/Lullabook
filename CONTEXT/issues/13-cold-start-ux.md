# 13 — Cold-start UX: train-in-background + notifications

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: onboarding planning doc, ADR-0002

## What to build

Hide the minutes-long first-run training wait. The instant uploaded photos pass
moderation, kick off LoRA training in the background and immediately move the
parent into building their first Brief. If training finishes first, proceed
seamlessly; otherwise auto-start book generation when training completes, and
notify via email + web push so the parent can leave and return.

## Acceptance criteria

- [ ] Training starts immediately after photos pass moderation (no blocking wait screen).
- [ ] The Brief-building UI is available while training runs.
- [ ] Book generation auto-starts when training completes if the parent already submitted a Brief.
- [ ] Email + web-push notification fires on Persona ready.
- [ ] Expectation-setting copy ("~5 minutes") is shown.

## Blocked by

- 04 — Baby Persona creation
- 06 — Generate Storybook (single-persona)
