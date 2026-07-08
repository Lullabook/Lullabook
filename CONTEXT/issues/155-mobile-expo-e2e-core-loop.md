# 155 — Mobile/Expo e2e: headless iOS flow for the core loop

Status: shipped

First mobile e2e via Maestro (`mobile/.maestro/r1-core-loop.yaml`): headless YAML flow drives
the core R1 loop on iOS Simulator against the 153 seed — open → seeded book → reader → page
turn → PDF export. CLI-runnable by an agent, no manual taps; asserts reader budgets hold (no
infinite "Illustrating"). Folded into `verify` (154) as an optional/tagged mobile stage. Later
extended by 161 to cover finalize→export.

(condensed 2026-07-07 — full spec in git history)
