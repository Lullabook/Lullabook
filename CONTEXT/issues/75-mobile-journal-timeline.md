# 75 — Mobile Journal: real Moment capture + timeline

Status: shipped

Replaced mock state in `mobile/app/daily.tsx` with the real capture loop over the
issue-74 API: logging a Moment calls `createMoment` then refetches; timeline loads
`listMoments(babyId)` reverse-chronological with significant Moments marked; empty state
for a Baby with no Moments. Baby selection uses the Member's default Baby (multi-Baby
picker deferred). Closed as code-complete (GH #18); HITL Simulator pass was owed to
issue 85's runbook (never executed — see 85).

(condensed 2026-07-07 — full spec in git history)
