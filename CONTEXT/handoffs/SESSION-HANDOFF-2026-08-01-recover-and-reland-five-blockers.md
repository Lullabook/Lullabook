# Handoff — 2026-08-01 — Recover and re-land the five live-run blockers

## What the session was asked to do

Push this worktree to `main`, then fast-forward it.

## Outcome

The work is **not on `main`**. It is on [PR #191](https://github.com/Lullabook/Lullabook/pull/191),
open and awaiting the user's review. The user explicitly chose "re-land, but PR
only" — do **not** merge #191 without asking them again.

The fast-forward is complete: the worktree sits on `main` at `1d890b3`, clean,
0 behind and 0 ahead.

## The important part: the work was nearly lost

An automated actor closed [PR #190](https://github.com/Lullabook/Lullabook/pull/190)
**without merging** and deleted its branch on the remote and locally, leaving the
commits unreachable from any ref. Evidence: `mergedAt: null`, `mergeCommit: null`,
`state: CLOSED`, and a `head_ref_deleted` timeline event in the same second as the
close.

Recovery refs now protect everything. **Do not delete these until #191 lands:**

| Ref | Holds |
| --- | --- |
| `rescue/lul-100-five-blockers` (local + pushed as `fix/lul-100-five-blockers`) | The four commits on PR #191 |
| `rescue/agent-skills-2026-08-01` (tag) | `.agents/` and `.codex/`, deleted from disk and in no commit |

Restore the skills with:

```
git checkout rescue/agent-skills-2026-08-01 -- .agents .codex
```

`codex-native-selector/` was deleted by the same cleanup and exists in **no**
commit or checkpoint. It is unrelated tooling and is unrecoverable from this repo.

## Who the actor is

`super.engineering.app` (Superconductor), PID 3253 — the app that hosts the agent
session. It is the **parent** of the Claude process, so it cannot be killed without
killing the session. There is no rogue agent: a process sweep found exactly one
Claude session (this one). Anyone investigating "another session" should stop
looking for one and instead treat Superconductor's worktree lifecycle actions as
the cause.

Superconductor also performed the earlier mutations that made this session
confusing: it committed the user's uncommitted work mid-run, ran a destructive
clean of untracked files, and switched branches under the session.

**Implication for the next agent:** this worktree is not safe for unattended
multi-step work. Re-read `git status` and `git rev-parse HEAD` before every
commit, push, or tracker write. Never assume the tree you measured is the tree
you are committing.

## Verification state

Run on the merged tree, all green:

- `npx tsc --noEmit` — pass
- `npx vitest run` — **963/963 pass**
- `npx eslint` on every changed file — 0 errors

## Two pre-existing gates that do NOT work — do not chase these

1. **CI is red on `main` itself.** The last six CI runs on `main` failed,
   including current `main` (`1d890b3`). The `test` job runs `npm ci` only at the
   repo root and never in `mobile/`, so `mobile/tsconfig.json` cannot resolve
   `extends: "expo/tsconfig.base"`. Every test importing a `mobile/` file dies
   there (11 failures, one root cause). PR #191 shows the same failure. It is not
   a regression. Fixing it means adding a `mobile/` install step to
   `.github/workflows/`.
2. **`npm run verify` cannot pass on this machine.** Its per-step `execSync`
   timeouts (60s typecheck, 120s vitest) are shorter than the suite takes
   (~260s), so the gate times out instead of reaching a verdict. Use the
   underlying commands directly until `scripts/verify.mjs:18-28` is fixed.

Also note: `npx eslint .` reports 1420 errors / 5024 warnings repo-wide. This is
pre-existing and lint is **not** part of `verify`.

## Known follow-up worth a ticket

`ColdStartService` receives `persistStore` and `dispatchWorkflow` as separate
callbacks (`src/lib/context.ts:143-148`) and still lacks the second sync after an
inline drain — the identical bug PR #191 fixes on the top-level `persist()`.
Left alone deliberately: widening a fix inside a merge conflict resolution would
be an unreviewed behaviour change.

## What is in PR #191

Five live-run defects plus the `origin/main` merge. The PR body carries the full
table of fix → file → symptom; do not duplicate it here. One conflict was
resolved: `main` refactored `persist()` into the `persistStore`/`dispatchWorkflow`
aliases, and the inline-sync fix was reapplied on top of that shape.
`tests/persist-inline-workflow-ordering.test.ts` scans that body as source text,
so it was updated to accept either spelling while asserting each alias still
resolves to `store.sync()`/`workflow.flush()`.

## Suggested skills

- **`linear-pipeline`** — load before any stage work. LUL ticket IDs are in play
  and Linear is the only write surface for workflow state.
- **`part4`** — the natural next stage. PR #191 is built and hardened; it needs an
  independent grade before it can close. The grader must read only the diff and
  the ticket, never this handoff.
- **`shared-worktree-safety`** — mandatory here given the Superconductor
  interference described above.
- **`part1`** — to file the `ColdStartService` follow-up as a proper ticket.

## Immediate next actions

1. Ask the user whether to merge PR #191. Do not merge unprompted.
2. Restore `.agents/` and `.codex/` from the rescue tag if the user wants them
   tracked, then commit them.
3. Once #191 lands, delete the two rescue refs.
