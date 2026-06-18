# 83 — HITL: auth & account (Google, Apple, session, hard-delete)

Triage: ready-for-agent (HITL)

## Parent
PRD v10 — `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`

## What to build
The auth + account section of the smoke runbook, executed on the local Simulator. Verifies
the social-only auth (issue 81) and account hard-delete (issue 80) really work end to end.

- **Google sign-in:** with the Supabase Google provider + redirect configured (issue 82
  prerequisite), sign in on the Simulator; confirm a Member is created and `/api/home`
  returns data (not 401).
- **Apple sign-in:** if the Simulator is signed into an Apple ID, run it; **if not, mark
  this step deferred to a device/TestFlight (issue 63)** — do not fail the wave for it.
- **Session restore:** kill + relaunch the app; confirm the session persists (lands in
  tabs, not sign-in).
- **No email/password UI** appears in a non-dev build (the dev escape hatch is
  `__DEV__`-gated only).
- **Account hard-delete:** run the real delete behind the confirmation gate; confirm
  sign-out + that the **test Family's photos/storybooks/account are purged from DB and
  blob** (the PRD security invariant).

## Acceptance criteria
- [ ] Google sign-in creates a Member and lands a Bearer session `/api/home` accepts (no 401).
- [ ] Apple sign-in passes on a signed-in Simulator, **or** is explicitly recorded as
      deferred-to-device with the reason.
- [ ] Session survives an app relaunch.
- [ ] Hard-delete removes the test Family across DB + blob; nothing orphaned (verified, not assumed).
- [ ] Each step has a recorded PASS/FAIL row; any FAIL filed as a `bug` issue with repro.

## Blocked by
82
