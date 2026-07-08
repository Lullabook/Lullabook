# 77 — Bearer API for Storybook create/generate + list

Status: shipped

Canonical routes, still binding: `POST /api/storybooks` (create/generate from a Brief,
enforces `isActive` subscription gate, dev-forceable via `DEV_FORCE_SUBSCRIPTION`,
returns id + `generating` status, kicks the durable workflow) and `GET /api/storybooks`
(list with status `generating|draft|failed|finalized`). `mobile/lib/api.ts` gained
`createStorybook`, `listStorybooks`, `getStorybook`. No token → 401; inactive gate →
same denial as web. Closed as code-complete (GH #20).

(condensed 2026-07-07 — full spec in git history)
