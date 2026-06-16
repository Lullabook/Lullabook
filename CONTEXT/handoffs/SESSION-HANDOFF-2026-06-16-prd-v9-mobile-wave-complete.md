# Session Handoff — 2026-06-16: PRD v9 mobile wave (issues 75–81)

> Completes the native mobile feature wave after issue 74. **225 tests green.**

## Issues completed

| Issue | Summary |
|-------|---------|
| **75** | `daily.tsx` wired to `createMoment` / `listMoments`; real timeline + empty state |
| **76** | Firsts filter chip + inline "Make this a Story" offer (confirms Story Type in create flow) |
| **77** | `POST/GET /api/storybooks` Bearer routes + tests; reroll/candidate select routes |
| **78** | `storybooks/new.tsx` illustrated Brief → generate → navigate to reader/poll |
| **79** | `storybooks/index.tsx` library + `storybooks/[id].tsx` paged reader w/ re-roll holes |
| **80** | `GET/PUT /api/characters/[id]`; edit form loads/saves; account hard-delete already real |
| **81** | Social-only sign-in/sign-up (Apple + Google); email/password removed |

## Backend additions

- `src/app/api/storybooks/route.ts` — create + list
- `src/app/api/storybooks/[id]/route.ts` — Bearer + cookie auth; full pages + candidates
- `src/app/api/storybooks/pages/[pageId]/reroll-image/route.ts`
- `src/app/api/storybooks/candidates/[candidateId]/select/route.ts`
- `src/app/api/characters/[id]/route.ts` — GET + PUT
- `src/lib/request-auth.ts` — Bearer or cookie for images/avatars/detail routes
- `/api/home` now returns `selectedBaby` for Journal capture
- `tests/77-mobile-storybook-bearer-api.test.ts`

## Mobile

- `mobile/lib/api.ts` — storybook, character, illustration helpers
- Journal, Storybook library/create/reader, character edit, social auth
- `expo-auth-session` added for Google OAuth
- More tab links Storybooks

## Test state

- `npm test` — **225 passed** (59 files)

## Honest follow-ups / HITL gaps

- **Issue 70** — authenticated Add Family photo upload end-to-end still needs Simulator HITL
- **Google OAuth** — requires Supabase Google provider + redirect URL configured; test on device/Simulator with real credentials
- **Apple Sign-In** — Simulator needs Apple ID; native button hidden when unavailable
- Illustrated generation HITL — run `npm run dev:paid` + Expo against `:3001`, generate a book, confirm reader pages load with Bearer image headers
- Mobile TS type-check pre-existing noise unchanged

## Suggested next

- Hermes Simulator pass recording HITL for Journal → Storybook happy path
- Issue 70 photo-upload HITL closure
- Payment `/part1` (deferred per PRD v9)

## Suggested skills

- `hermes` / `xcode-ios-dev` for Simulator verification
- `lullabook-design-check` if polishing mobile screens further
