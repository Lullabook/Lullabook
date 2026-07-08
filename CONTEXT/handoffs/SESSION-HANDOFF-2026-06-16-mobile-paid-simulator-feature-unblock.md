# Session Handoff — 2026-06-16: mobile paid simulator feature unblock

Status: historical

Got the Expo iOS app running in paid local mode (:3001) and replaced dead mobile controls
with real routes/handlers: character list + create via `POST /api/characters`, storybook
new/detail screens, branded not-found/modal, bearer-authed `POST /api/personas` (multipart
photos → 202), hard-delete wired behind native confirm, Baloo 2 / Nunito fonts loaded on
mobile.

- Binding: real-person Character selection routes to Add Family — Characters stay fictional-only.
- Binding: `POST /api/personas` validates paid/cast/consent gates, stages photos in the Family-scoped blob store, enqueues training, returns `202`.

(condensed 2026-07-07 — full text in git history)
