# 50 — Moment capture + Journal timeline (walking skeleton)
Status: shipped
Foundational Moment/Journal data model: additive `moments` table (`id`, `baby_id`, `body`, `occurred_on`, `is_significant`, `created_at`), `createMoment`/`listMoments` service (reverse-chron per Baby), riding the Baby's existing consent + hard-delete/purge path. Web capture UI later cut in the mobile pivot; the R1 ruthless cut (148) trimmed scope to bare "daily notes"; the mobile Journal was restored over this same API in 165/ADR-0026. Schema/service unchanged since.
(condensed 2026-07-07 — full spec in git history)
