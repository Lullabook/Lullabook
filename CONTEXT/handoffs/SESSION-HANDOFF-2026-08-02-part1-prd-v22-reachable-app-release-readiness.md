# Part1 handoff — PRD v22 reachable app release readiness

**Date:** 2026-08-02
**Mode:** `/part1` planning complete. No application code changed. No provider spend.
**Branch/base:** `main` at session start; worktree contains planning artifacts only.
**Planning reviewers:** Claude Opus 5 / Claude Code / medium reconnaissance; GPT-5.6 Luna / Codex / max independent planning review. Final corrections were applied by the parent before publication.

## Destination

A release-ready reachable iOS app in which an ordinary Guardian uses no provider credentials, passes server-authoritative consent/entitlement gates, generates a visible Storybook, sees progress/failure, uses a responsive app, and reaches a release gate with bounded/observable provider spend.

## Source of truth

- Specification: `CONTEXT/planning/prd-v22-reachable-app-release-readiness.md`
- Ticket set: `plans/reachable-app-release-readiness/TICKETS.md`
- Published issue bodies: `plans/reachable-app-release-readiness/issue-bodies/`
- Issue map: `plans/reachable-app-release-readiness/issue-map.tsv`
- Parent spec issue: https://github.com/Lullabook/Lullabook/issues/193
- Existing Wayfinder map: https://github.com/Lullabook/Lullabook/issues/133

## Locked decisions and invariants

- Provider keys stay server-side; users never need model-provider access.
- R1 retains ADR-0028 pricing/cap: `$14.99/$119.99`, three trained Personas, four completed 12-Page Storybooks per monthly reset.
- Character-only Briefs use deterministic local placeholder art with zero fal calls. Selecting an unconfirmed Persona is rejected before spend.
- Production generation is durable/asynchronous; create p95 `<2s`; Story text p95 `<25s`; full 12-Page production-like run p95 `<90s`; five-minute watchdog; terminal `draft|failed` only.
- Cold start p95 `<3s`; reader page turn p95 `<100ms`; Story detail `<500KB`; polling ≤40 requests per five-minute run.
- Exact twelve Pages/Scenes, bounded re-roll candidates, finalization selects one candidate per Page.
- Consent, liveness, moderation-before-staging, signed fal callbacks, owned artifacts, RLS, Hard-delete, and Family boundaries are enforced on the production path.
- Persona lifecycle is durably observable: `training → review → likeness-confirmed → Story-ready`; retrain `review → training`; `review`/`training` spend-blocked; legacy `ready` only means Story-ready after likeness confirmation.
- `$10` bakeoff and `$2` final provider smoke are separate fresh approvals; synthetic/consenting-adult fixtures only.
- Deterministic verification never treats skipped live/native evidence as PASS.
- Journal/Daily Notes and Bedtime/Learning are reachable required flows; deferred heavy Journal machinery and audio/video/invitations/Share links remain inert.

## Published ticket statuses

| Local | GitHub | Status | Summary |
|---:|---:|---|---|
| 186 | #194 | Agent Ready | Async generation and terminal state |
| 187 | #195 | Planned | Progress/reader; blocked by #194 |
| 188 | #196 | Agent Ready | Persona consent/moderation/training lifecycle |
| 189 | #197 | Planned | 12-Page/placeholder/re-roll contract; blocked by #194 |
| 190 | #198 | Planned | Spend boundary; blocked by #194 |
| 191 | #199 | Agent Ready | Performance instrumentation |
| 192 | #200 | Planned | Read hydration/blob cost; blocked by #199 |
| 193 | #201 | Planned | Polling/startup/render; blocked by #200 |
| 194 | #202 | Planned | RevenueCat/entitlement lifecycle; blocked by #198 |
| 195 | #203 | Planned | Reachable release gate; blocked by Wayfinder #135, #150, #195–#202 as listed in the issue |
| 196 | #204 | Agent Ready | Super.Engineering current-workspace iOS launcher |
| 197 | #205 | Planned | Final RLS/Hard-delete/release evidence; blocked by #203 |

At publication, the parent spec issue #193 was `Planned`; roots #194, #196, #199, and #204 were `Agent Ready`; dependent tickets were `Planned`. The user later manually set all PRD v22 Project items (#193–#205) to `Agent Ready`; the `Blocked by` edges remain authoritative and are preserved in every issue body.

## Current Project completion order

`#193` (index) → `#194` → `#196` → `#199` → `#204` → `#195` → `#197` → `#198` → `#200` → `#201` → `#202` → `#203` → `#205`.

This is a topological order: dependency-free roots first, then their dependents, with #203's external Wayfinder gates #135 and #150 still required.

## Next agent

Start at local ticket **186 / GitHub #194**. Do not run a live provider command. Rotate the credentials pasted into chat before any canary. The Super.Engineering launcher is planned as #204; configure it only as its own implementation task using `$SUPERCONDUCTOR_WORKSPACE_PATH`, not a hardcoded checkout path.

## Verification evidence for planning

```text
npm run graph:index -- --check  PASS
Ticket structure/dependency validator  PASS (12 tickets; backward local edges)
GitHub issue creation/add/status readback  PASS (parent + 12 child issues)
No application code changed; no provider command run.
```
