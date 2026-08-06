# 216 — OPTIONAL, USER-OWNED: evaluate Prime Intellect GEPA on the Story prompt

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Off the critical path and outside the two-week demo. Prime Intellect v0.6.21 hosted training runs the `prime-rl` container over verifiers environments, which is reinforcement learning for language models; it cannot train a FLUX image LoRA, so it has no role in the likeness pipeline. Its genuine fit is `prime gepa` prompt optimization and `prime eval` scoring on the twelve-Page Story-text prompt. The Guardian owns this ticket and picks it up on his own cadence.

## Acceptance criteria

- [ ] `prime login` is completed and `prime whoami` returns the account.
- [ ] A golden set of Briefs plus expected twelve-Page contract outcomes exists as a verifiers environment or an eval dataset.
- [ ] `prime eval` produces a baseline score for the current Sonnet 4.6 Story prompt on that golden set.
- [ ] `prime gepa` runs one optimization pass and the resulting prompt is scored against the same baseline.
- [ ] A findings document records the score delta, the Prime spend, and one recommendation: adopt, iterate, or drop.
- [ ] Production Story routing is unchanged by this ticket.

## Verification-command

```bash
prime whoami --plain && test -f CONTEXT/handoffs/PRIME-STORY-PROMPT-EVAL.md
```

## Blocked by

none (deliberately off the critical path)

## Invariants restated

none

## Notes

DO NOT let this block or delay any PRD v23 ticket. It is filed because the Guardian asked for it to exist, not because the demo needs it. It also pairs with the deferred cheap-model bake-off.

**Target backend:** Not applicable; off the critical path.
