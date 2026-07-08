# Session Handoff — 2026-06-18: `/part2` re-run — issue 82 verification gate

Status: historical

Added the machine-checkable gate for the HITL runbook: `scripts/check-hitl-runbook.mjs` +
`npm run check:runbook` — exits 0 iff all required sections exist, no nonexistent npm
script / repo file / ADR is cited, and no literal secret is pasted. Fault-injected all five
failure classes to prove the checker catches them.

- Binding: every slice that edits `HITL-SMOKE-RUNBOOK.md` must run `npm run check:runbook` afterward.
- Binding: issues carry a Verification-command field (per updated /part1//part2 skills); backfill it for pre-rule issues when picked up.

(condensed 2026-07-07 — full text in git history)
