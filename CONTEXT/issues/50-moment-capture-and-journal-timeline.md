# 50 — Moment capture + Journal timeline (walking skeleton)

Triage: ready-for-agent

## What to build
The foundation of Journal & Moments: a parent can log a **Moment** about a Baby and
see it in that Baby's **Journal**. End-to-end thin slice — DB → service → UI.

- Migration: additive `moments` table — `id`, `baby_id` (FK), `body` (text),
  `occurred_on` (date, defaults today), `is_significant` (bool, default false),
  `created_at`. Reversible. Scoped to one Baby (one World).
- Service: `createMoment` and `listMoments(babyId)` (reverse-chronological by
  `occurred_on` then `created_at`), with the same auth/ownership checks the other
  per-baby reads use. Moments ride the Baby's existing consent + hard-delete/purge
  (ADR-0007) — wire Moment deletion into the Baby/Household purge path.
- Capture form: text + date (defaults today) + a `significant ✨` toggle. Reachable
  from the Journal. Use the existing v2 design system; do **not** author new visual
  design.
- Journal surface: a per-Baby tab/section in the World showing the reverse-chron
  timeline of Moments, significant ones visually marked. Empty state invites the
  first Moment.

## Acceptance criteria
- A parent can create a Moment for the selected Baby and immediately see it in that
  Baby's Journal timeline; significant Moments are visually distinguished.
- Moments are strictly scoped to one Baby — they never appear under another Baby in
  the Household.
- Migration is additive + reversible; all existing tests stay green.
- Hard-deleting / purging a Baby (or Household) also removes its Moments.
- New tests cover create + list + per-baby scoping + purge cascade (test-first).

## Blocked by
34 (Household + Baby + World foundation)
