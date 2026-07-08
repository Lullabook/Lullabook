# Session Handoff — 2026-06-13 — "Maya's World" `/part2` build (issues 46–47 + v2 UI)

Status: historical

Cursor TDD build on `feat/maya-world-issues-34-44` (168 tests green): issue 46
Character auto-description (domain field + migration 005 + Anthropic adapter),
issue 47 Maya's World demo seed (test fixture + dev runtime seed + CLI), the v2
Create composer, the Stories shelf with status-aware routing, `/characters/[id]/edit`,
v2 token/visual work, and `design/lullabook-current-design.html`.

- Binding: `Character.description` is auto-generated on create/update and must pass `childSafety.checkText` moderation before persisting.
- Binding: book links go through `bookHref(status,id)` / `resumeHref(id,page)` in `src/lib/book-nav.ts` (finalized→`/read`, otherwise `/storybooks/[id]`) — never hardcode `/read`.
- Binding: dev demo seed is gated by `NODE_ENV==='development' && DEV_DEMO_SEED==='true'` and writes RLS-scoped display-only rows (no generated Pages).

(condensed 2026-07-07 — full text in git history)
