# Session Handoff — 2026-06-18: skill guardrails + GitHub issue reconciliation

Status: historical

Meta session, no app code: hardened the global `/part1`/`/part2` skills (they live at
`~/.claude/skills/{part1,part2}/SKILL.md`, NOT in this repo) and closed GH #18–24 (issues
75–81) as code-complete after re-verifying each against the code; remaining work was HITL
Simulator verification.

- Binding: `/part1` locks invariants (latency budgets, failure modes, security boundaries) before to-prd; `/part2` runs a red-team pass (weird inputs, dependency failures, permission edges) after tdd and verifies the /part1 invariants — the two are wired together.
- Open decision at the time: proposed 3rd guardrail = pre-push gate (block push on red suite / type errors / unrecorded red-team finding) — user call owed.

(condensed 2026-07-07 — full text in git history)
