# 126 — R1 end-to-end smoke (the tracer bullet: sign-in → story → PDF)
Status: shipped
Automated e2e proving the full R1 loop against local dev (DEV_FAL_FALLBACK): sign in → seed baby+family → generate a Bedtime book → assert illustrated `draft` (≥1 image) → export PDF. This was the R1 done-signal / release gate.
Invariants asserted: terminal state within watchdog, detail payload < 500KB (Track A); deterministic in CI, no live keys required.
(condensed 2026-07-07 — full spec in git history)
