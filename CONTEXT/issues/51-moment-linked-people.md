# 51 — Linked people on a Moment
Status: cut
Added a `moment_people` join table + "who was there?" picker linking a Moment to existing Family roster members/Characters (never creates people; cleans up on delete). Backend/schema shipped and still present (`linkedPeople` in the Moments API), but swept into the R1 "defer the rest of Journal/Moments" cut (148) — not resurfaced in the mobile Journal restore (165).
(condensed 2026-07-07 — full spec in git history)
