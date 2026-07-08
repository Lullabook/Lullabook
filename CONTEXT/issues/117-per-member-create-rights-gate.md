# 117 — Per-member create-rights gate
Status: superseded by 146-cut-multi-family-solo-only.md
Added EntitlementService.requireCanCreate(familyId, actorMemberId): Just Us → Guardian only, Our Whole Family → any Member; wired into StorybookService.generate/generateFromClassic right after requireEntitled. actorMemberId always taken from the verified Bearer JWT, never the request body.
Superseded — 146 hard-codes create-rights to solo-Guardian-only server-side for R1, mooting the two-plan distinction.
(condensed 2026-07-07 — full spec in git history)
