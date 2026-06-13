# Session handoff — 2026-06-13 — issue 50 Moment capture + Daily wiring

## Issue completed

**50 — Moment capture + Journal timeline (walking skeleton)**

Picked because it is the lowest-numbered unblocked slice in the Journal & Moments
chain (`SESSION-HANDOFF-2026-06-13-journal-and-moments-part1.md`), with blocker 34
already shipped. UI shells from the Maya's World drop-in were already on branch
`plan/journal-and-moments-50-56`; this session wired real persistence behind them
**without changing existing UI features** (same layout, type chips, routine panel).

## What was built

- **Migration** `supabase/migrations/006_moments.sql` — `moments` table
  (`baby_id`, `body`, `occurred_on`, `is_significant`, `moment_type`, FK cascade).
- **Domain** `Moment` in `src/domain/types.ts`; UI `MomentType` stays in
  `src/domain/daily-types.ts`.
- **Service** `src/services/moment.ts` — `create`, `list` (reverse-chron by
  `occurred_on` then `created_at`), `formatMomentDateLabel`.
- **Store** — `moments` map, RLS-scoped reads, hard-delete cascade in
  `hardDeleteFamily`.
- **Supabase** — hydrate/sync for `babies`, `baby_person_bonds`, `moments`; members
  sync now includes `selected_baby_id` (needed for multi-baby Daily).
- **Action** `createMomentAction` in `src/lib/actions.ts`.
- **Daily page** — loads selected/default Baby + real moments; client calls server
  action on "Add moment" (no visual redesign).
- **Tests** `tests/50-moment-capture.test.ts` — create, list, per-baby scoping,
  sort order, hard-delete purge.

## Test state

`npx vitest run` → **172 passing** (was 168; +4 from issue 50).

## How to view locally

Dev server: `npm run dev` → http://localhost:3000 — sign in, open **Daily** in v2
nav (`/daily`). Add a moment; it persists across refresh. Apply migration 006 to
local Supabase if using Postgres (`supabase db push` or run the SQL manually).

## Honest follow-ups

- **Routine editor** still stubbed (`Edit` button TODO); not in issue 50.
- **Significant ✨ toggle** not in the dropped UI — `is_significant` is derived from
  type (`milestone` / `first` → true) until a toggle is added.
- **Linked people** on Moments → issue **51**.
- **Weekly spread** → issue **52**.
- **Daily nudge card** on World home → issue **53** (blocked by 50 — now unblocked).
- **Auto-context personalization** → issue **54**.
- Mobile `mobile/app/daily.tsx` still optimistic-only; web is the issue-50 slice.
- Voice clips / babies were missing from Supabase sync before this session; babies +
  bonds added here alongside moments (voice clips still in-memory-only in prod DB).

## Next ready issue

**51 — Linked people on a Moment** (or **52** / **53** / **54** in parallel off 50).
Suggested: **53 — Daily nudge card** next if continuing the capture habit loop on
World home.

## Suggested skills

- `/part2` — pick up issue 51, 52, 53, or 54.
- `/tdd` — default implementation mode.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
