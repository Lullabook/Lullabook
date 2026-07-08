# 74 — Bearer API for Moments (create/list) + mobile client

Status: shipped

Canonical routes established and still binding: `POST /api/moments` (create Moment for
caller's Baby from Bearer-resolved Member; body/text, momentType, occurredOn, optional
linkedPeople/significant) and `GET /api/moments?babyId=…` (reverse-chronological,
Family-scoped list). Reuses the same Bearer token → Member → Family resolution as
`/api/home`. No token → 401. `mobile/lib/api.ts` gained `createMoment`/`listMoments`.
Closed as code-complete (GH #17).

(condensed 2026-07-07 — full spec in git history)
