# Session Handoff — 2026-06-14 — Issue 64: Baby `birthDate`

Status: historical

Shipped issue 64: `Baby.birthDate` across domain type, in-memory store, and Supabase;
migration `supabase/migrations/009_baby_birthdate.sql`; `BabyService.updateBaby` with
guardian gate + date validation; birthdate form on Account. Also carried an auth-form fix,
free-tier cast limits (3 slots), and dual dev dist dirs from the prior session.

- Binding: `birthDate` is `string | null` in `YYYY-MM-DD` format; edits are guardian-gated.
- Migration 009 must be applied to any Supabase environment.

(condensed 2026-07-07 — full text in git history)
