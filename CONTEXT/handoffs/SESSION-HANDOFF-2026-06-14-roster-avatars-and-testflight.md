# Session Handoff — 2026-06-14: Roster Avatars, Local-Dev Ergonomics & TestFlight (PRD v7, issues 57–63)

> Planning session (`/part1`). **No app code changed.** Grilled three entangled
> threads that surfaced from a real local run, wrote PRD v7 + ADR-0020 + the
> "Roster avatar" glossary term, broke it into **issues 57–63**, logged two UI
> feedback items, and created **two project skills** for the design system.

## What happened this session

1. Read all of `CONTEXT/` + the native-iOS handoff + ADR-0001/0002 + the persona/
   blob/context code to ground the grill.
2. Ran **`/grill-with-docs`** — resolved the load-bearing forks (table below).
3. Wrote **`CONTEXT/docs/adr/0020-roster-avatar-generated-not-raw-photo.md`** and
   added the **Roster avatar** glossary term to `CONTEXT/CONTEXT.md`.
4. Wrote **`CONTEXT/planning/prd-v7-roster-avatars-and-testflight.md`**.
5. Broke it into **issues `57`–`63`** (dependency-ordered tracer-bullet slices).
6. Created **`CONTEXT/planning/web-and-app-feedback.md`** (running UI feedback log).
7. Created two **project skills**: `.claude/skills/lullabook-design/` (the v2 design
   system) and `.claude/skills/lullabook-design-check/` (the linter), each SKILL.md +
   REFERENCE.md, from the user's `skill.md` / `skill-design-check.md`.

## Locked decisions (full reasoning in PRD v7 + ADR-0020)

| # | Decision |
|---|---|
| 1 | Roster avatar is **display-only** — photos still uploaded, LoRA still trains, stories/video still resemble the real person. ADR-0001/0002 untouched. |
| 2 | Avatar is **generated from the person's LoRA** on `ready`; neutral placeholder while `training`/`failed`. |
| 3 | Raw photos **never rendered on any display surface** (web + mobile), for **Baby and adults alike**. ADR-0020. |
| 4 | Photos stay editable: **update/replace reference photos → retrain → regenerate avatar**; photos swapped, never displayed. |
| 5 | **BLOB bug**: dev fallback to a **disk-backed local blob store** when `BLOB_S3_*` absent + non-prod (mirrors the moderation dev-fallback in `context.ts`). Prod requires real R2. |
| 6 | **TestFlight = one HITL runbook** (Apple Dev enroll → real eas/app ids + bundle id → deploy backend on Vercel → `eas build`/`eas submit`). Apple Developer membership is the hard gate. |
| 7 | **Two-mode local dev**: `dev:free` (:3000) + `dev:paid` (:3001) seeded to opposite Subscription states. |
| 8 | **Web polish**: Create-page font consistency + World "What happened today?" nudge contrast. |

## Slice order (issues 57–63)

`57` BLOB dev fallback (unblocks add-member locally) → `58` Roster avatar web
(generate-from-LoRA + render everywhere + no raw photo; implements ADR-0020) → `59`
update/replace reference photos → `60` two-mode local dev → `61` web polish → `62`
mobile roster-avatar parity → `63` HITL TestFlight runbook.

- **57** is pure infra, blocks anything storing a photo/avatar.
- **58** is the spine (ADR-0020 on web); blocked by 57.
- **59** blocked by 58. **62** blocked by 58 (so the TestFlight build ships the rule).
- **63** blocked by 62 + a deployed backend (which the runbook sets up).
- **60**, **61** are independent — land anytime.

## Key code seams (verified against current code)

- **Blob fallback** — `src/lib/context.ts:57` always `new R2BlobStore()`; copy the
  moderation pattern at `context.ts:50-55`. `InMemoryBlobStore` shape in
  `src/adapters/fakes.ts:258`; build a disk-backed sibling for persistence.
- **Avatar generation** — extend the `ready` branch of `trainWithRetry` in
  `src/services/persona.ts` (currently only flips status + notifies). `getLikenessSamples`
  there returns a stubbed `example.com` URL — replace with the real avatar render.
  Add nullable `avatarKey` to the member; null ⇒ placeholder.
- **Family member = Persona** in code (v5 UI rename not done). Routes live under
  `src/app/(app)/family`, `world`, `personas`; create flow goes through
  `src/lib/actions.ts` → `PersonaService`.
- **Mobile** — Expo app under `mobile/`; `eas.json`/`app.json` have placeholder ids.

## First moves for the next agent

1. Read `CONTEXT/planning/prd-v7-roster-avatars-and-testflight.md`, then `CONTEXT.md`
   ("Roster avatar"), ADR-0020, and `CONTEXT/planning/web-and-app-feedback.md`.
2. Start at **`CONTEXT/issues/57-blob-dev-fallback-local-store.md`** and follow the
   `Blocked by` chain.
3. Build **TDD** (red → green). Run `npx tsc --noEmit` + lint for root **and**
   `mobile/` before declaring a slice done; keep existing tests green.
4. Use the **`lullabook-design`** skill when building UI and **`lullabook-design-check`**
   to lint it (both now installed under `.claude/skills/`).
5. Issue **63** is HITL — Claude writes the runbook; the human executes the Apple /
   Vercel / EAS steps.

## Suggested skills for next session

- `/part2` (or `/tdd`) — start at issue 57.
- `lullabook-design` + `lullabook-design-check` — for the avatar/UI slices (58, 61, 62).
- `/code-review` (high) — after each slice.
- `/handoff` + `/push-handoff` — at session end.
