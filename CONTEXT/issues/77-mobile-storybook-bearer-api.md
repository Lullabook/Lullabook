# 77 — Bearer API for Storybook create/generate + list

Triage: ready-for-agent

## What to build
Expose Storybook generation and listing to the native app over the Bearer API,
mirroring the existing web server actions/`src/services/storybook.ts`. No pipeline
changes — this is the route layer the mobile client needs.

- `POST /api/storybooks` — create/generate a Storybook from a Brief (starring cast +
  Story Type + theme, optional Moment-seeded note) for the caller's Family. Enforces the
  existing `isActive` gate (force-unlocked in dev via `DEV_FORCE_SUBSCRIPTION`). Returns
  the new Storybook id + initial `generating` status; kicks the existing durable
  workflow.
- `GET /api/storybooks` — list the Family/World's Storybooks with status
  (`generating | draft | failed | finalized`).
- Confirm whether `GET /api/storybooks/[id]` already returns Pages + per-Page candidates
  for the reader (issue 79); if not, note the gap for that slice.
- `mobile/lib/api.ts`: add `createStorybook(brief)`, `listStorybooks()`, and a
  `getStorybook(id)` typed client.

## Acceptance criteria
- A Member with an active (or dev-forced) subscription can create a Storybook and list
  their books over Bearer auth; no token → **401**; inactive gate → the same denial the
  web path returns.
- Routes tested at the service seam with Anthropic/fal/moderation adapters faked
  (401 + gate + create→list round-trip); existing tests stay green.
- No new domain logic or migration.

## Blocked by
Nothing (storybook service + pipeline exist). Pairs with 78/79.
