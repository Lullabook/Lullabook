# 116 — Two-plan entitlement model (Just Us / Our Whole Family)
Status: superseded by 129-collapse-to-one-plan.md
Replaced the tier config in EntitlementService with two plans (ADR-0025): Just Us (8 stories, no voice/video, login-cap=parent) vs Our Whole Family (20 stories, voice+video, login-cap=family); added requireMemberLoginSlot(familyId), distinct from the likeness memberCap; entitlement kept keyed on familyId, server-authoritative, dev override prod-guarded.
Superseded when R1 collapsed to a single plan (129), later finalized solo-only by 146.
(condensed 2026-07-07 — full spec in git history)
