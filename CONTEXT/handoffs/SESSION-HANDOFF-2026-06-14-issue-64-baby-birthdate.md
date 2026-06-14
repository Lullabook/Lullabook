# Session Handoff — 2026-06-14 — Issue 64: Baby `birthDate`

**Agent:** Cursor (`/part2`). **Branch:** `plan/photo-stories-firsts-birthday-64-73`.
**Tests:** `npm test` → **217 green** (56 files). Issue 64 adds 4 tests; prior session added `61-free-cast-limit`.

## Issue completed: **64 — Baby `birthDate` field + migration**

### What shipped
- **`Baby.birthDate`** (`string | null`, `YYYY-MM-DD`) on domain type + in-memory store + Supabase hydrate/sync.
- **Migration** `supabase/migrations/009_baby_birthdate.sql` — `birth_date date` nullable on `babies`.
- **`BabyService`**: `addBaby({ birthDate? })`, new **`updateBaby({ birthDate?, displayName? })`** with guardian gate + date validation.
- **Server action** `updateBabyBirthDateAction` + **`BabyBirthdateForm`** on **Account → “Your little one”** (v2 tokens: cream inputs, Baloo/Nunito, pill save button).
- **Tests** `tests/64-baby-birthdate.test.ts` — create-with-date, edit, clear-to-null, default-null.

### Also in this commit (prior session, uncommitted)
- Auth fix: `src/lib/auth-actions.ts` — plain server forms (no broken `useActionState`).
- Free-tier cast: `src/lib/cast-limits.ts` (3 slots), training modal/rail, story generation overlay, composer illustrations toggle.
- Dual dev: separate `.next-free` / `.next-paid` dist dirs in `next.config.ts` + `package.json`.

### Honest deferrals
- **Birthday Story offer** (issue 68) not wired — needs `birthDate` scheduler (this issue only persists the field).
- **Multi-baby UI switcher** on Account still copy-only; `selectBaby` works in service layer.
- **HITL smoke** for birthDate persistence across Supabase restart — human should run locally after migration.

## Next ready issue

**65 — Moment photo (write-only) + vision→text adapter** (unblocked, PRD v8 spine).

Alternatives also unblocked: **67** Firsts view, **70** mobile photo upload, **73** lullaby HITL runbook.

## Suggested skills

- `/part2` — issue 65 next.
- `lullabook-design-check` — when Firsts / photo affordance UI lands (67, 65 web).
- `generation-pipeline` — if photo scene feeds story Brief (66).

## HITL (issue 64 DoD)

1. Run migration `009_baby_birthdate.sql` on local Supabase.
2. Account → Your little one → set birthday → restart dev → confirm date persists.
