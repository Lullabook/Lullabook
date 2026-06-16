# Session Handoff — 2026-06-16: issue 74 — Moments Bearer API

> `/part2` slice for PRD v9 mobile feature wave. Issue **74** complete; **75** is next.

## Issue completed

**74 — Bearer API for Moments (create/list) + mobile client**

## What was built

1. **`POST /api/moments`** — Bearer-authed Moment create for a Baby (`babyId`, `body`/`text`,
   `momentType`, `occurredOn`, `significant`, optional linked people). Returns serialized Moment.
2. **`GET /api/moments?babyId=…`** — Family-scoped reverse-chron list for that Baby.
3. **`mobile/lib/api.ts`** — `createMoment(...)` and `listMoments(babyId)` typed clients.
4. **Tests** — `tests/74-mobile-moments-bearer-api.test.ts` (401, create→list, cross-Family denial).
5. **Test fixture** — `createTestContext()` now exposes `persist()` so Bearer route handlers
   can be exercised in vitest.
6. **Subagents** — `.cursor/agents/lullabook-design.md` and
   `.cursor/agents/lullabook-design-check.md` (from `/create-subagent` + design skills).

## Test state

- `npm test` — **222 passed** (58 files), including new issue-74 tests.
- No web UI changes; no migration (Moments table from issue 50).

## Honest follow-ups

- **Issue 75** — wire `mobile/app/daily.tsx` mock state to `createMoment` / `listMoments`
  (timeline refetch loop); apply Maya's World design-check on touched screens.
- **Issue 70** — authenticated Add Family photo HITL still outstanding from prior session.
- Mobile type-check pre-existing failures (`ExternalLink` routes, `@/domain/*` alias) unchanged.

## Suggested next issue

**75 — Mobile Journal: wire Daily → real capture + timeline** (blocked only by 74, now done).

## Suggested skills

- `/part2` + `tdd` for issue 75
- `lullabook-design` + `lullabook-design-check` when editing Daily/Journal mobile UI
- `hermes` or `xcode-ios-dev` for Simulator HITL after wiring
