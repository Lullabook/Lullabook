# 96 — 5-tab information architecture (retire the flat "More")

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track C.

## What to build
Replace the flat Home + catch-all **"More"** tab with the researched **5-tab IA**:
**Home / Stories / Create / Family / Settings**. Web + mobile parity.

- Define the five sections and move existing surfaces into them (Stories shelf, Create
  flow, Family roster + Characters, Settings/account/subscription). No feature is lost;
  everything currently under "More" finds a home.
- The "More" route is removed.

## Acceptance criteria
- [ ] All five tabs route correctly on web and mobile; no orphaned/Unmatched routes.
- [ ] The flat **"More" tab no longer exists**; its contents are reachable under the new
      tabs.
- [ ] **Failure invariant:** unknown/legacy deep links resolve or redirect, never a white
      screen / Unmatched Route (the macOS-dupe regression class stays guarded).
- [ ] Existing web + mobile tests stay green; nav tests assert the five tabs + absence of "More".

## Verification-command
```bash
npm test -- navigation && tsc --noEmit
```

## Blocked by
None
