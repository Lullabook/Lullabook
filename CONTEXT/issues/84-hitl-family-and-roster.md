# 84 — HITL: family & roster (create member, photo upload, avatars, edit)

Triage: ready-for-agent (HITL)

## Parent
PRD v10 — `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`

## What to build
The family/roster section of the smoke runbook. Verifies the photo-upload wiring (issue
70), roster avatars, and Character edit (issue 80) against the real backend on Simulator.

- **Create member/persona:** add a roster member with a dev sample photo; confirm it
  persists and the **training → ready** lifecycle copy reflects real state.
- **Photo upload (issue 70):** the authenticated Add-Family photo upload completes end to
  end (no minor photo reaches storage before the consent gate + moderation — ADR-0010);
  confirm the upload lands in blob storage.
- **Roster avatar:** the generated avatar appears per the roster-avatar rule (issues 58/62).
- **Edit Character (issue 80):** open edit, confirm existing questionnaire values load,
  change one, save, confirm it persists on reload.

## Acceptance criteria
- [ ] Creating a roster member persists and shows the correct training/ready state.
- [ ] Photo upload completes; the photo is in blob storage and respects the consent/
      moderation gate (no raw minor photo bypasses it).
- [ ] The roster avatar renders per the established rule.
- [ ] Editing a Character loads existing values and saves changes (survives reload).
- [ ] Each step recorded PASS/FAIL; any FAIL filed as a `bug` issue with repro.

## Blocked by
82, 83
