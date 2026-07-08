# Session handoff — 2026-06-13 — issue 50 Moment capture + Daily wiring

Status: historical

Completed issue 50 (Moment capture + Journal timeline walking skeleton, 172 tests
green): migration `006_moments.sql`, `Moment` domain type, `MomentService`
(create/list), store + Supabase hydrate/sync for babies/bonds/moments,
`createMomentAction`, and the Daily page wired to real persistence without
changing the dropped-in UI.

- Binding: Moment lists are reverse-chron by `occurred_on` then `created_at`; moments are per-Baby scoped and purged by `hardDeleteFamily`.
- Binding: `is_significant` is derived from type (`milestone`/`first` → true) until a ✨ toggle exists.
- Binding: members sync includes `selected_baby_id` (needed for multi-baby Daily).

(condensed 2026-07-07 — full text in git history)
