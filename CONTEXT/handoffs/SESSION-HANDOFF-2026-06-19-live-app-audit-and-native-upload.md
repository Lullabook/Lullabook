# Session Handoff — 2026-06-19: live-app-audit skill + native FormData helper

> Small session on `main` after PR #39 merged. No domain/service logic changed.
> Adds orchestration skills and a tiny mobile upload helper.

## What happened

1. **Authored `live-app-audit` skill** (`.claude/skills/live-app-audit/SKILL.md` +
   `REFERENCE.md`). Orchestrates a full free+paid feature sweep by delegating every
   run to the **`hermes`** subagent (`Task` tool, `subagent_type: "hermes"`).
   REFERENCE.md holds the 17-row flow matrix and P0/P1/P2 severity rubric. Invoke
   when the user wants to "test everything" / pre-release smoke.

2. **Added `xcode-ios-dev` skill** (`.claude/skills/xcode-ios-dev/SKILL.md`). Thin
   wrapper that reads `.cursor/agents/xcode-ios-dev.md` and spawns a general-purpose
   subagent for first-time Xcode / Simulator setup. Complements the existing Cursor
   agent definition; does not duplicate its checklist inline.

3. **Extracted native FormData helper** — `mobile/lib/form-data.ts` with
   `NativeUploadFile`, `appendNativeFile`, and `setNativeFile` for React Native's
   `{ uri, name, type }` upload parts (not web Blobs). `mobile/app/family/new.tsx`
   now imports from here instead of inlining the interface.

## State

- `main` is current through PR #39 (June 18 live-app-run + dupe sweep handoff).
- Next planned HITL work remains **issue 83** (auth & account runbook §1) per the
  June 18 handoff chain.
- `next-env.d.ts` has a local `.next-free` path tweak from running `dev:free` — do
  **not** commit; it is environment-generated.

## Not done / follow-ups

- **Run `live-app-audit`** — skill exists but no audit has been executed yet this
  session; hermes should drive the first full free+paid sweep.
- Mobile submit handlers beyond `family/new.tsx` wiring may still need the
  `form-data` helper if other screens upload photos.
- HITL Simulator passes for issues 75–81 are still owed (runbook exists).

## Suggested skills

- **live-app-audit** → drives **hermes** for the live free+paid feature sweep.
- **xcode-ios-dev** → first-time Xcode / Simulator setup for native runs.
- `/part2` — issue 83 (HITL runbook §1 auth & account).
