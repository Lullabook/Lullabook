# 131 — Onboarding aha: Demo Story → sign-up → trial → consent → photos
Status: shipped
Wired the R1 first-run flow: pre-baked baby-free Demo Story (illustrated, < 1s, no model call) shown before any sign-up → "Make one starring my baby" → sign up → start trial (128) → Email-Plus consent (127) → upload baby photos.
Invariant: Baby Persona creation gated on consent + entitlement, both server-enforced.
(condensed 2026-07-07 — full spec in git history)
