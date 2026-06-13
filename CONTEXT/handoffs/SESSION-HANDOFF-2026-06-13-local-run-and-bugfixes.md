# Session Handoff — 2026-06-13: first local run + 4 bug fixes

> The user ran the **web app locally for the first time** and reported real bugs.
> This session: stood up local-dev config and fixed four bugs surfaced by that
> run. A large product **revamp (Persona → "Family"/world pivot)** is being
> planned next via `/part1` — it is NOT part of this handoff (see last section).

## 1. Local-dev setup (so the web app is viewable)

The composition root (`src/lib/context.ts`) wires the real `SupabaseDataStore`
on every request and auth runs on every page, so a real Supabase project is the
hard floor — there is no in-memory demo mode. New artifacts:

- `CONTEXT/local-dev/RUN-LOCAL.md` — step-by-step: create free Supabase project,
  paste 3 keys into `.env.local`, run schema, disable email-confirm, `npm run dev`.
- `CONTEXT/local-dev/schema.sql` — migrations 001–003 concatenated for one paste
  into the Supabase SQL editor.
- `.env.local` — **git-ignored** (`.env.*`); holds the user's real Supabase +
  Anthropic + fal keys. **Never commit.** Not in the repo.

User-side steps remain manual (Supabase project, run schema, turn off
"Confirm email" in Supabase Auth). Direct dashboard links are in the chat.

## 2. Four bug fixes (from the first real local run)

| # | Symptom | Root cause | Fix | File(s) |
|---|---------|-----------|-----|---------|
| 1 | `sync upsert light_consent_receipts failed: violates FK ...character_id` | `sync()` ran **all** table upserts in one `Promise.all` → child rows raced ahead of parents. Fakes don't enforce FKs, so 132 tests never caught it. | Run upserts **sequentially parent→child** (array was already topologically ordered), deletes child→parent. | `src/db/supabase-store.ts` |
| 2 | `Missing required environment variable SIGHTENGINE_API_USER` blocked text stories + photos locally | No Sightengine account in local dev; real adapter fails closed (correct for prod). | Added `PermissiveDevModeration`; composition root selects it only when `SIGHTENGINE_API_USER` absent **and** `NODE_ENV !== production`. ADR-0010 preserved in prod. | `src/adapters/moderation.ts`, `src/lib/context.ts` |
| 3 | Persona photos: "one photo replaces the other", can't add 3 | Native `<input type=file multiple>` replaces its FileList each time the picker reopens. | Accumulate into React state + thumbnails + per-photo remove; mirror back into the real input via `DataTransfer` so the server action still gets `getAll("photos")`. | `src/components/persona-form.tsx`, `src/app/globals.css` |
| 4 | Sign-in failed once, worked after refresh | No `middleware.ts`; Supabase SSR needs middleware to refresh the session cookie → first post-login render races. | Added guarded session-refresh middleware (no-op when Supabase env absent). | `src/middleware.ts` (new) |

## Test / build state

- `npm test` — **132 passed** (unchanged; FK bug is invisible to the in-memory fakes).
- `npx tsc --noEmit` — **no new errors** in any changed file. Pre-existing debt in
  `tests/23-native-auth-bearer.test.ts` (RequestContext mock missing `roster`/`persist`) is unchanged.
- Dev server boots clean with middleware; `/`, `/sign-up`, `/sign-in` all 200.

## Honest follow-ups / known gaps

- The FK-ordering fix is **not covered by a regression test** — the fakes can't
  reproduce it (real-Postgres RLS/FK harness is still the deferred PRD v4 item).
  Verified by reasoning + manual run, not by a red test.
- `PermissiveDevModeration` is a deliberate **local-only safety bypass**. Ensure
  no deploy sets it (guard is `NODE_ENV !== production` + missing Sightengine key).
- Photo previews call `URL.createObjectURL` per render without revoke — negligible
  leak for a few files; tidy if the form grows.
- Stray untracked macOS dupes (`mobile/*" 2".*`) exist — not ours; leave out of commits.

## Next: the revamp (planned separately via `/part1`)

The user wants a product pivot — captured here only as a pointer; the actual
decisions get grilled and documented in the `/part1` chain (grill-with-docs →
PRD → issues → handoff → push). Raw intent from the user:

- Reframe from **bedtime/nighttime storybook → a whole "world" for the baby**.
- **Character** stays = made-up / fictional characters only (simpler).
- **Rename Persona → "Family"**; add as many family members as you want. ⚠️
  Collides with the existing domain `Family` (account/household) + `Member` +
  `Guardian` (ADR-0006) and `Persona` (likeness model, ADR-0008) — terminology
  must be grilled.
- Each family member: **relationship to the baby**, **what they call the baby**
  (nickname), **photos**, and **audio clips** of what they'd say to the baby.
- **Audio personalization** is framed by the user as "the real money-seller part."
- Baby = the **main character** of the world.

Do not implement any of this yet. See also memory `lullabook-deferred-design`
(full-body photos, clothing options, pricing — also pending design docs).

## Suggested skills for the next session

- **`/part1`** — run the full planning chain on the revamp (the user explicitly
  asked to be grilled hard). Starts with `grill-with-docs` against `CONTEXT.md`
  glossary + ADRs 0006/0008 to resolve the Family/Persona/Member terminology clash.
- **`/push-handoff`** — already being run to ship this handoff + the 4 fixes.

## Key refs

- Glossary: `CONTEXT/CONTEXT.md` · ADRs: `CONTEXT/docs/adr/` (esp. 0006, 0008, 0013)
- Prior handoff: `SESSION-HANDOFF-2026-06-13-skills-push-handoff.md`
- Local run: `CONTEXT/local-dev/RUN-LOCAL.md`
