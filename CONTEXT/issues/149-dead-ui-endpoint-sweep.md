# 149 — Dead-UI / dead-endpoint sweep (the cut is a cut, not a hide)

Status: shipped

Automated done-gate for the R1 simplification wave (145-148): checks every deferred feature
(audio, multi-family/invites/voice-messages, Asia jurisdiction, deferred Journal machinery,
v14 R2-defer list) has no reachable mobile UI and its endpoint is disabled server-side (404/403,
never 500). Fails loudly if a deferred feature becomes reachable again. Extends
`scripts/check-hitl-runbook.mjs` pattern; produces human-readable pass/fail report.

(condensed 2026-07-07 — full spec in git history)
