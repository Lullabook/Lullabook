# Session Handoff — 2026-06-14 — Local dev workflow, family UX, Daily Life

**Branch:** `plan/photo-stories-firsts-birthday-64-73` · **PR:** [#15](https://github.com/VrajGupta/Lullabook/pull/15)  
**Prior handoff:** `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-14-issue-64-baby-birthdate.md` (issue 64 committed as `140aba2`)

## What this session did

### Local dev — story + persona create without Inngest Cloud
- **`LocalDevWorkflowAdapter`** (`src/lib/create-workflow-adapter.ts`): when `INNGEST_EVENT_KEY` is unset, storybook and persona jobs run **inline** on `persist()` — fixes “Failed to send event” on story create and persona upload in local dev.
- **`runPersonaCreateBody`** extracted to `src/workflows/persona-create-body.ts`; `createPersonaAction` uses `ctx.workflow.requestPersonaCreate` + `persist()` instead of direct `inngest.send`.
- Test: `tests/66-local-dev-workflow.test.ts`.

### Family / character add UX (buttons felt dead)
- **PersonaForm:** `onSubmit` + photos appended from React state (fixes race); clearer disabled labels; baby-gate error on click.
- **QuestionnaireForm:** removed “real child” / “who is this character”; made-up friends only; `noValidate` + scroll-to-error.
- **Family page:** dashed “Add someone” uses `addHref` (free → `/characters/new`, paid → `/personas/new`).
- **`/personas/new`:** free users redirect to `/characters/new`; wider layout (`maxWidth: 1100`).
- **`/characters/new`:** cast-limit gate before showing form.
- **Composer:** error shown in sticky rail above Generate button.

### Daily Life
- Renamed nav + title to **“Daily Life”** (was “Daily” / “Daily live”).
- **Fixed clipped page:** `.v2-shell` had `overflow: hidden` — changed to `overflow-x: hidden`; removed phantom 72px bottom padding.
- **Responsive layout:** `.v2-daily-layout` stacks on mobile; routine panel first on small screens.
- **Editable routine:** Guardian can Edit → save `{baby}'s usual day`; persisted on `Baby.dailyRoutine` + migration `010_baby_daily_routine.sql` + `updateBabyDailyRoutineAction`.
- Header nav: CSS grid so pill nav doesn’t leave awkward empty gap on wrap.

### Automation
- **Playwright:** `e2e/smoke.spec.ts`, `playwright.config.ts`, `npm run test:e2e` / `test:e2e:ui`.
- **Hermes subagent:** `.cursor/agents/hermes.md` — browser/E2E specialist for full-site audits.

## Test state
- **`npm test`:** 219 green (57 files).
- **`npm run test:e2e`:** 5 smoke tests green (with dev server on :3000).
- **Family unit tests:** `03-adult-persona`, `04-baby-persona`, `35-family-roster`, `61-free-cast-limit` — all green.

## HITL — family adding (user has not browser-tested yet)

| Tier | URL | Flow | Needs |
|------|-----|------|-------|
| **Free** | http://localhost:3000 | Family → Add character → questionnaire | Supabase only |
| **Paid** | http://localhost:3001 | Family → Add family member → 3 photos (+ selfie for adult) | Supabase + **FAL_API_KEY** (training) + **AWS Rekognition** (adult selfie) |

Photos persist under `.localblob/` without R2. Inngest optional locally (inline adapter).  
Run migrations **009** (birthDate), **010** (dailyRoutine) if not applied.

Dev servers last restarted: `npm run dev:free` (:3000), `npm run dev:paid` (:3001).

## Honest deferrals
- Illustrated persona on :3001 still needs fal + AWS for full “ready” training — inline workflow fixes enqueue only.
- Playwright smoke does not cover authenticated family-add (needs test user / storageState).
- `COMPOSER_25_DEBUG_PROMPT.md` in repo root is stray — not committed.

## Next ready issue (from issue 64 handoff)
**65** — Moment photo write-only + vision adapter (ADR-0021), or **67** Firsts view.

## Suggested skills
- **`hermes`** — authenticated E2E: sign-up → Family → add character → add persona on :3001.
- **`/part2`** — issue 65 next.
- **`lullabook-design-check`** — after Firsts / photo UI lands.
