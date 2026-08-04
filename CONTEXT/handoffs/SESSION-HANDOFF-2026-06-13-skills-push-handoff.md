# Session Handoff — 2026-06-13: `/planner` + `/coder` mandatory push-handoff

Status: historical

Meta session, no app code: updated the global `~/.claude/skills/planner` and
`coder` orchestrator skills so every chain ends `handoff → push-handoff`, and
merged `fix/web-shared-service-bugs` → `main` (origin/main at `a8b5f76`,
including issues 32–33).

- Binding: both chains must finish with `push-handoff`, which must merge to `main` and verify `origin/main` HEAD (not just push a feature branch); summaries include pushed commit hash + branch.
- Note: skill files live under `~/.claude/skills/`, outside this repo — re-sync to other machines manually.

(condensed 2026-07-07 — full text in git history)
