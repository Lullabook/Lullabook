# 73 — Lullaby real-path HITL manual test runbook

Triage: ready-for-agent (HITL)

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
The lullaby-weave **generation contract already shipped** (issue 39): `storybook.ts` places
the lullaby clip on the final page, feeds the clip transcript as `lullabyPhrase` into
generation, and the Reader plays the right clip per page. What has never happened is the
product owner running the **real** flow end-to-end. This slice produces a **runbook** (like
the issue-63 TestFlight runbook) — Claude writes it; the human executes it with real keys.

- A `CONTEXT/local-dev/`-style runbook walking the real flow: record (or supply) a real
  [Voice clip](../CONTEXT.md) with a transcript → generate a Story with that clip chosen as
  the lullaby → open the Reader → confirm the story ends toward the recorded phrase and the
  clip plays on the right page.
- List the exact env/secrets required, the local commands, and the expected observations at
  each step. Note any gap found between the runbook and current behavior as a follow-up.
- **No code change** unless the runbook surfaces a real defect (then file/fix separately).

## Acceptance criteria
- [ ] A written runbook exists that a human can follow to exercise the real lullaby flow
      locally with real keys.
- [ ] It enumerates required secrets, commands, and expected per-step observations.
- [ ] It explicitly verifies: lullaby clip lands on the final page, the narrative sets up
      the recorded phrase, and the Reader plays the correct clip per page.
- [ ] Any defect found while writing/dry-reading the runbook is captured as a follow-up
      note (not silently fixed in this slice).

## Blocked by
None - can start immediately
