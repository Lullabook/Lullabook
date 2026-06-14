# Session Handoff — 2026-06-14: PRD v8 planning (Photo Stories, Firsts, Birthday)

> `/part1` planning run. Produced PRD v8 + ADR-0021 + glossary updates + issues 64–73.
> **No application code written** — this was planning only. Next: `/part2` from issue 64.

## What this session did

Planned the next feature wave while Cursor handles website design. Grilled the scope,
locked decisions, wrote the PRD, broke it into ten dependency-ordered issues.

## Locked decisions (full detail in the PRD)

- **PRD v8 = a feature wave on the v6 Moment/Journal loop + the already-shipped lullaby.**
  Monetization **and** TestFlight execution stay **deferred** (unchanged from v5/v6/v7).
- Four threads: **lullaby real-path testable** (no model change — issue 39 already shipped
  the contract), **Firsts view + instant offer**, **photo-to-story**, **birthday auto-story**.
- **Photo-to-story** is a photo on a Moment, **write-only** (never displayed, retained,
  vision→text only, never trains likeness) — see ADR-0021.
- **Birthday only**; holiday/jurisdiction calendar deferred.
- **Real output only, no dev fakes** — each feature's DoD includes an HITL real-keys smoke;
  the automated suite still fakes adapters at the service seam.
- **Web + native iOS parity**; the pre-existing mobile photo-upload TODO is a prerequisite.

## Artifacts produced (read these, not this doc)

- PRD: `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`
- ADR: `CONTEXT/docs/adr/0021-moment-photos-write-only-vision-to-text.md`
- Glossary: `CONTEXT/CONTEXT.md` — new "Photo-to-story & calendar stories (PRD v8)" section
  (Moment photo, Firsts, Birthday Story)
- Issues: `CONTEXT/issues/64`–`73`

## Slice order (start at 64)

`64` Baby birthDate → `65` Moment photo write-only + vision adapter (spine) → `66` scene
description → story → `67` Firsts view + instant offer → `68` Birthday offer (needs 64) →
`69` hard-delete purge Moment photos → `70` mobile photo-upload wiring (prereq) → `71`
native photo-to-story → `72` native Firsts+Birthday → `73` lullaby HITL runbook.

Independent / can start anytime: 64, 65, 67, 70, 73.

## Code facts established while grilling (verify before relying)

- Lullaby weave already in `src/services/storybook.ts` (`getVoiceClipForPage`,
  `lullabyPhrase` from clip transcript). Issue 39 shipped.
- Milestone/`first` already a `momentType` in `src/services/moment.ts` (`significanceForType`).
- Weekly suggestion already fires on a single significant Moment
  (`src/services/journal-nudge.ts`, `weekMoments.length >= 3 || significant >= 1`).
- `Baby` (`src/domain/types.ts`) has **no** birthDate field — issue 64 adds it.
- Mobile add-family `submit()` / photo upload still TODO-wired (prior handoff) — issue 70.

## Still open / not done by this session

- All v8 implementation (issues 64–73). No tests written this session; suite was 212 green
  at start (per the issues-58–63 handoff).
- v7 issue 63 (TestFlight) remains human-executed and **not done** — out of scope for v8 but
  still the path to a real device build.

## Suggested skills

- `/part2` — pick up issue 64 and implement test-first (tdd → handoff → push-handoff).
- `lullaby` work (issue 73) and TestFlight (v7/63) are HITL — surface to the human.
- `lullabook-design-check` — after any UI lands (Firsts view, photo affordance, birthday card).
