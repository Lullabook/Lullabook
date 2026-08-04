# Session Handoff — 2026-06-18: `/coder` issue 82 (HITL smoke runbook foundation)

Status: historical

Shipped issue 82: wrote `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` — §0 foundation complete
(bring-up, env/secrets checklist by name only, OAuth prerequisites, test-Family setup,
invariants PASS/FAIL contract, defect path); §1–§5 scaffolded for issues 83–87. Red-team
verified the runbook's factual claims and reworded the p95 latency check to a
human-observable proxy.

- Binding: runbook secrets are referenced by name only, never pasted; test Family uses dev/sample photos only.
- Known debt flagged: `mobile/package.json` `ios:paid` hard-codes a dev password literal — future cleanup slice.

(condensed 2026-07-07 — full text in git history)
