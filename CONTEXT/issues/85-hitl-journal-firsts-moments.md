# 85 — HITL: Journal, Firsts & Moments

Triage: ready-for-agent (HITL)

## Parent
PRD v10 — `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`

## What to build
The Journal/Firsts/Moments section of the smoke runbook. Verifies Moment capture +
timeline (issue 75), the Firsts view + "Make this a Story" offer (issue 76), moment-photo
write-only capture, and the birthday offer against the real backend on Simulator.

- **Moment capture + timeline (75):** log a Moment; confirm it appears at the **top of the
  timeline within 2s** (latency invariant) and **persists across an app reload**. Empty
  state renders for a Baby with no Moments.
- **Firsts view (76):** filter to first/milestone Moments; confirm only those show.
- **"Make this a Story" offer (76):** take the offer; confirm it opens the Storybook
  create flow with the Moment text **seeded**, and that **no generation is triggered**
  until Story Type is confirmed (suggestion contract).
- **Moment photo write-only (65/71):** attach a photo to a Moment; confirm it's
  write-only (never re-displayed as a raw photo) per ADR-0021.
- **Birthday offer (68/72):** with a Baby birthDate set, confirm the birthday Story offer
  surfaces at the right time.

## Acceptance criteria
- [ ] Logging a Moment persists across reload and appears at the top within the 2s budget.
- [ ] Firsts view shows only first/milestone Moments; empty state works.
- [ ] The offer seeds the create flow and triggers **no** generation before Story-Type confirm.
- [ ] Moment photo capture is write-only (no raw re-display).
- [ ] Birthday offer surfaces for a Baby with a birthDate.
- [ ] Each step recorded PASS/FAIL; any FAIL filed as a `bug` issue with repro.

## Blocked by
82, 83, 84
