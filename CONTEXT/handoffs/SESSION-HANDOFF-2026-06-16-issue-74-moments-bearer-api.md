# Session Handoff — 2026-06-16: issue 74 — Moments Bearer API

Status: historical

Shipped issue 74 (PRD v9): Bearer-authed `POST /api/moments` (create for a Baby) and
`GET /api/moments?babyId=…` (Family-scoped reverse-chron list), typed mobile clients
`createMoment` / `listMoments` in `mobile/lib/api.ts`, tests covering 401 + cross-Family
denial.

- Binding: mobile-facing API routes are Bearer-authed; Moment lists are Family-scoped per Baby.
- Test fixture `createTestContext()` exposes `persist()` so Bearer route handlers are exercisable in vitest.

(condensed 2026-07-07 — full text in git history)
