# 64 — Baby `birthDate` field + migration
Status: shipped
Added optional, nullable `birthDate` on the `Baby` domain type + a `babies` table migration, captured/editable in the create/edit flow, null-safe for existing babies. The field persists as a domain concept independent of any feature that consumes it; its one confirmed consumer (Birthday Story, issue 68) was later deferred in the R1 ruthless cut (148), but `birthDate` itself is unaffected.
(condensed 2026-07-07 — full spec in git history)
