# Demo-failure reproduction — issue #213 (local ticket 202)

> Purpose: reproduce and record the first live demo failure of each of the five
> demo flows by **running** the app backend against a real Supabase project
> (the dev backend `mobile/.env` and `.env.local` point at), not by reading code.
> Nothing here is fixed. Every claim below is something actually observed on
> 2026-08-08 against `npm run dev` (localhost:3000, real `.env.local`).
>
> **Method, stated plainly.** No iOS Simulator native build was feasible in the
> 45-minute-per-flow timebox, so the flows were driven through the app's own
> HTTP surface: Supabase email signup + password token grant for auth, then the
> Bearer-authenticated API routes the mobile/web app calls (`POST
> /api/characters`, `POST /api/personas`, `POST /api/storybooks`,
> `GET /api/storybooks`). Each request's HTTP status, response body, and server
> log line were captured. The iOS Simulator UI (`cd mobile && npm run ios`) was
> **not exercised** — that gap is stated under each flow and in the closing
> notes.
>
> **The headline.** Three of the five flows fail with the **same, reproducible
> server error, before any provider is called**: every authenticated *mutation*
> returns `HTTP 500` with an empty body and the server logs
> `Error: hydrateFamily failed: column moderation_audit.family_id does not
> exist` at `src/db/supabase-store.ts:407` (reached via `requireBearerMember`
> at `src/lib/bearer-auth.ts:43` in `withBearerAuth`). The dev Supabase project
> is **missing migration `023_moderation_audit_family_ownership.sql`** (the
> `moderation_audit.family_id` column), so any request that must resolve
> Family-owned moderation state fails closed. Read-only `GET`s happened to
> return `200`; **all writes 500.** The PRD's hypothesis was "the live provider
> path has never run"; this reproduction shows the app is broken *earlier still*
> — at the database schema — on the real dev backend. No provider was called
> and no money was spent during this reproduction.

---

## Sign-in

**WORKS** — a real account was created and a valid bearer session obtained.

Evidence (observed 2026-08-08, localhost:3000):

1. `POST {supabase}/auth/v1/signup` → `HTTP 200`, returned an
   `access_token` + user object (`id`, subscriber email) with email
   confirmation already satisfied (`email_confirmed_at` populated — the dev
   Supabase has "Confirm email" OFF per RUN-LOCAL.md §3).
2. `POST {supabase}/auth/v1/token?grant_type=password` → `HTTP 200`, JWT
   `access_token` of expected shape; user `"confirmed": true`.
3. `GET /api/home` with `Authorization: Bearer <token>` → `HTTP 200`
   `{"member":{"id":"8d3c138f-…","role":"guardian","jurisdiction":"US_IOS"},
   "selectedBaby":null,"personas":[],"characters":[],"subscriptionActive":
   false,"hasConsentReceipt":false,…}` — the app's authenticated home resolved
   a real Family member.

Not exercised: the iOS Simulator login UI and Apple/Google OAuth (no native
build in timebox; the runbook's §1 covers OAuth separately).

`WORKS` — no owning ticket.

---

## Roster

**FAILED** — first failure on adding a roster member.

Failing request: `POST /api/characters` with a valid `TraitQuestionnaire`
body → **`HTTP 500`**, empty response body.

Verbatim server log line (`npm run dev`, `.env.local`):

```
Error: hydrateFamily failed: column moderation_audit.family_id does not exist
    at SupabaseDataStore.hydrateFamilyBody (src/db/supabase-store.ts:407:15)
    at async SupabaseDataStore.hydrateFamily (src/db/supabase-store.ts:293:7)
    at async SupabaseDataStore.hydrateByAuthUser (src/db/supabase-store.ts:118:5)
    at async resolveMember (src/lib/bearer-auth.ts:43:18)
    at async requireBearerMember (src/lib/bearer-auth.ts:96:18)
    at async withBearerAuth (src/lib/api-route.ts:29:29)
POST /api/characters 500 in 1775ms
```

Root-cause hypothesis: the dev Supabase project predates
`supabase/migrations/023_moderation_audit_family_ownership.sql`; the
`moderation_audit` table there is missing `family_id`, so hydrated Family
state that includes moderation ownership throws. The same 500 appeared on
`POST /api/personas`, `POST /api/storybooks`, and repeated runs (6 occurrences
in the server log) — it is stable, not a one-off.

Owning ticket: **#214** (local 203 — deploy + migrate the real backend so the
demo surface runs against a correctly-migrated database; the live docs cut in
RUN-LOCAL.md §2 do not cover 023).

Screen/flow: Roster add-member (the web/mobile roster create surface). Because
the failure is at auth-time Family hydration, the roster cannot render or add
any member on this backend until the migration is applied.

---

## Persona creation

**FAILED** — first failure observed before any persona-specific gate runs.

Failing request: `POST /api/personas` (multipart, `mode=adult`,
`displayName=Test`, no photos) → **`HTTP 500`**, empty body.

Verbatim server log line (same root error as Roster; last 2 lines shown):

```
POST /api/personas 500 in 1342ms
Error: hydrateFamily failed: column moderation_audit.family_id does not exist
```

Root-cause hypothesis: identical schema gap to **Roster** — `resolveMember`
(inside `withBearerAuth`) throws before the subscription gate (the `402
"Illustrated family members need an active subscription…"`) or the
child-safety/moderation gate is even reached. The persona flow therefore
cannot be exercised end-to-end on this backend.

Owning ticket: **#214** (local 203 — migrated, running backend is a
prerequisite for any persona work; the persona-internal provider gates are
tickets #216 live fal auth / #217 photo intake / #218 consent roster, but the
observed first failure is the schema 500 above, not those).

---

## Story generation

**FAILED** — first failure on creating a Storybook.

Failing request: `POST /api/storybooks` with a `Brief`
(`{"theme":"A bedtime adventure","storyType":"BEDTIME",…}`) → **`HTTP 500`**,
empty body.

Verbatim server log line:

```
POST /api/storybooks 500 in 612ms
Error: hydrateFamily failed: column moderation_audit.family_id does not exist
```

Root-cause hypothesis: `resolveMember` fails before the Issue-186
workflow-dispatch guard (`WorkflowConfigurationError`) and before any provider
(before Anthropic Story-text or fal image spend). No provider call was made.
The intended "fails closed, no spend" design (Issue 186) is correct, but the
code never reaches it because Family hydration 500s first.

Owning ticket: **#214** (local 203 — a migrated, running backend is the
prerequisite; ticket #221 owns the five-Persona Story-text contract once the
backend runs).

---

## Reader

**BLOCKED** — could not be exercised end-to-end, recorded honestly.

What ran: `GET /api/storybooks` (Bearer) → **`HTTP 200`**
`{"storybooks":[]}`. There is no Storybook to open because **Story
generation 500s** (above), so no finalized or even drafted Storybook exists to
read. Reader paging, per-Page re-roll, illustration loading, and export cannot
be driven until a Storybook can be produced.

Partial observation: the list surface responds (`200`, empty), but the reader
itself (a specific finalized book) is unreachable.

Owning ticket: **#214** (local 203 — backend must run and story generation must
land to produce a book to read; the fourteen-Page likeness reader contract is
#222 once books exist).

---

## Summary

| Flow | Result | First failure / evidence | Owning ticket |
|------|--------|--------------------------|---------------|
| Sign-in | WORKS | signup + password token 200, `/api/home` 200 | — |
| Roster | FAILED | `POST /api/characters` 500 — `hydrateFamily failed: column moderation_audit.family_id does not exist` | #214 |
| Persona creation | FAILED/BLOCKED | `POST /api/personas` 500 (same error; gated calls unreachable) | #214 |
| Story generation | FAILED | `POST /api/storybooks` 500 (same error; no provider spend) | #214 |
| Reader | BLOCKED | no Storybook exists (`GET /api/storybooks` 200 `[]`) | #214 |

## What was left unexercised, stated plainly

- **iOS Simulator / mobile app not driven.** `mobile/.env` points the app at
  `:3002` (`dev:all`) and no server was running on it; a native Expo SDK 56
  build was not feasible within the per-flow timebox. All five flows were
  exercised through the web/API surface the mobile app calls, not through the
  Simulator UI. The OAuth (Apple/Google) and native-entry paths in the
  HITL runbook §1 were not run.
- **No migration was applied and nothing was fixed (per ticket).** No DB
  connection string exists on this machine (same gap ticket 203 records for
  Vercel creds), so `023` could not be applied to unblock the deeper flows.
- **No real provider call was made.** Anthropic and fal keys exist in
  `.env.local`, but per the ticket's no-live-spend rule the flows were stopped
  at their first failure (which here occurs before any provider), so real
  Story-text generation, live LoRA training, and likeness confirmation were not
  exercised.
- **Capacity/timebox respected:** Sign-in + the shared schema failure consumed
  the bulk of the reproduction; the deeper per-flow gates (subscription, child
  safety/moderation, workflow dispatch, reader paging) are marked unobserved
  rather than guessed.