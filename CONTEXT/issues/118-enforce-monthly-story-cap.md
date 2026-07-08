# 118 — Enforce the monthly Story cap at generation
Status: shipped
Wired StoryCapService.requireUnderCap(familyId, memberId) into the generate path (previously computed/displayed but never enforced). The cap is a single shared per-Household pool across all creators, idempotent (distinct-by-id count), resets monthly; over-cap generation rejected 403 with a "N/N used, resets DATE" payload.
Invariant still binding regardless of later plan-model changes.
(condensed 2026-07-07 — full spec in git history)
