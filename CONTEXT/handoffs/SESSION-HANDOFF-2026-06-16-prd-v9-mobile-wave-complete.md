# Session Handoff — 2026-06-16: PRD v9 mobile wave (issues 75–81)

Status: historical

Shipped issues 75–81: mobile Daily wired to real Moments, Firsts filter + inline "Make this
a Story" offer, `POST/GET /api/storybooks` + reroll/candidate-select Bearer routes, mobile
storybook create/library/paged reader, character `GET/PUT /api/characters/[id]` + edit
form, social-only Apple + Google auth (email/password removed). 225 tests green.

- Binding: `src/lib/request-auth.ts` — image/avatar/detail routes accept Bearer or cookie auth.
- Binding: `/api/home` returns `selectedBaby` for Journal capture.

(condensed 2026-07-07 — full text in git history)
