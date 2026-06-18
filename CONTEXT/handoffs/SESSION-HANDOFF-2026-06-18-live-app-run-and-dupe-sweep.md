# Session Handoff — 2026-06-18: live app run + repo-wide macOS dupe sweep

> Tail end of a long session. The planning/build work is already captured in its own
> handoffs (skills-guardrails, part1-prd-v10, part2-issue-82, part2-rerun-verification-gate)
> and PRs — **this doc only covers what those don't:** running the mobile app on the
> Simulator, fixing a total expo-router failure, and a repo-wide duplicate-file cleanup.
> All session PRs are merged; `main` is current.

## What happened (new, not in other artifacts)

1. **Ran the mobile app** on the iOS Simulator against `npm run dev:paid` (:3001) +
   `npm run ios:paid`, per the issue-82 runbook (`CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md`).
   - The runbook's **IPv4 Metro proxy** step (`cd mobile && npm run proxy:8081`) was
     **required**: Metro binds IPv6 `[::1]:8081` only; the Simulator reaches it over
     IPv4 `127.0.0.1:8081`. Without the proxy the JS bundle never loads.
2. **Found + fixed a total route failure.** Every screen showed expo-router's
   **"Unmatched Route"**. Root cause: macOS `Name 2.ext` **duplicate files** in
   `mobile/app/` → duplicate route nodes → `validateRouteTreeExports` throws → router
   falls back to not-found for *everything*. (Saved as memory:
   `lullabook-macos-dupe-files-break-expo-router`.)
3. **Repo-wide dupe sweep** — the cruft was everywhere (128 files across `src/`, `tests/`,
   `CONTEXT/`, `mobile/`, `supabase/`, `tools/`), incl. 4 tracked. Removed all + added a
   `.gitignore` guard. See **PR #38** (merged). Duplicate `tests/* 2.test.ts` were also
   double-running before this.
4. App verified working post-sweep: signed in as the dev account (paid tier), navigates
   Home → Storybooks (real data) cleanly.

## State of `main` (all merged this session)
- **#28** skills-guardrails + closed issues 75–81 · **#35** PRD v10 plan · **#36** issue-82
  runbook · **#37** runbook verification gate (`npm run check:runbook`) · **#38** dupe purge.
- `npm run check:runbook` passes on `main`.

## Currently running (background, on this machine)
- Backend `dev:paid` on :3001, Metro + IPv4 proxy, iOS Simulator (iPhone 17). Tear down
  when done (`lsof -ti:3001,:8081 | xargs kill`, then quit Simulator) or leave for HITL.

## Loose ends / next
- **Next issue: 83** (HITL auth & account, GH #30) — write runbook §1; extend
  `check:runbook` to cover the new section. Issues 83–87 predate the Verification-command
  rule and don't carry one yet.
- **Untracked skill dirs** `.claude/skills/{live-app-audit,xcode-ios-dev}` left in place —
  decide whether to commit them (not cruft).
- **Reversible dupe backup** at `/tmp/lullabook-dupes-backup-repowide-*` — delete once
  confident.
- HITL passes themselves (the actual Simulator verification of issues 75–81) are still
  owed — the runbook now exists to drive them.

## Suggested skills
- `/part2` — issue 83 (runbook §1 auth & account).
- `hermes` / `xcode-ios-dev` — to actually execute the HITL runbook on the Simulator.
