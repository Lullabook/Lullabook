# Session Handoff — 2026-06-12: PRD v2 productionization one-shot COMPLETE

> For the next agent (the user may switch models). This session finished the
> `docs/FABLE-ONESHOT-PROMPT.md` one-shot that the 2026-06-11 sessions started.
> Everything is committed and pushed on branch
> `handoff/generation-pipeline-prd-v2` (HEAD message: "Glue: .env.example,
> README, real-adapter + SupabaseDataStore tests").

## Verification state (run these first to confirm nothing drifted)

- `npm test` → **24 files, 105 tests passing** (87 original + 18 new)
- `npx tsc --noEmit` → clean
- `npm run lint` → clean (flat config `eslint.config.mjs`, new this session)
- `npm run build` → compiles, 23 routes
- `npm install` needs `--legacy-peer-deps` (inngest ↔ vitest peer conflict)

## What this session delivered (beyond the 06-11 handoff's DONE list)

1. **Composition root + auth** — `src/lib/supabase.ts` (cookie auth client +
   service-role client), `src/lib/context.ts` (`createRequestContext()`:
   fresh SupabaseDataStore + real adapters + all services + `persist()` =
   `store.sync()` then `workflow.flush()`), `src/lib/auth.ts`
   (`getAuthedContext`/`requireAuthedContext`; first sign-in auto-creates
   Family+Guardian from signup-form jurisdiction metadata).
2. **Inngest functions** — `src/workflows/functions.ts` + serve route
   `src/app/api/inngest/route.ts`. v4 API: triggers live INSIDE the options
   object (`createFunction({ id, retries, triggers: {...} }, handler)`).
   Functions: `storybook-generate`, `page-recover`, `persona-create`
   (staged-upload keys in the event; on failure emails the member and
   rethrows), cron `scheduled-purges` (03:00 daily). The adapter gained
   `onStepCommitted?: () => Promise<void>` — each function sets it to
   `store.sync()` so committed steps are durable before the run advances.
3. **Server actions + API routes** — `src/lib/actions.ts` (every UI
   mutation; result-returning variants for client components + void
   `*FormAction` wrappers for direct `<form action>`); webhooks
   `api/webhooks/stripe` (checkout.completed → activate + **payment-VPC
   consent receipt for the Guardian**; subscription.deleted → cancel/purge
   window) and `api/webhooks/fal` (re-emits `fal.training.complete` Inngest
   event matching the parked `wait-for-training` step on `jobId`);
   `api/images` (signed-URL resolver, authorizes by `books/{familyId}/`
   prefix); `api/storybooks/[id]` (status polling); export PDF route;
   Supabase auth callback. `/share/*` gets `X-Robots-Tag` via next.config.
4. **Full UI** — hand-rolled bedtime design system in `src/app/globals.css`
   (DECISION: no CSS framework). Pages: landing, sign-in/up, library shelf
   with cold-start states, Brief composer (training-persona cold-start path
   included), classics picker + per-classic composer, generating
   live-progress (polling dots), draft curation board (free recover /
   budgeted re-rolls / candidates / finalize), page-turn reader, share view
   (passcode, server-minted signed URLs), characters questionnaire +
   promote-to-persona, persona roster + likeness confirm, text stories,
   billing, account (invites, remove member, jurisdiction notice,
   hard-delete confirm), goodbye.
5. **Glue** — `.env.example` (every env var the code reads — verified by
   grep), `README.md` (run/deploy/DECISIONS/known gaps/external blockers),
   new tests `tests/real-adapters.test.ts`, `tests/real-anthropic.test.ts`,
   `tests/supabase-store.test.ts`.
6. **Fixes along the way** — typed Supabase rows (`Row` alias) in
   `supabase-store.ts`; stub adapters got explicit `_`-prefixed params;
   `ExportService` gained an optional blob-key→signed-URL resolver param
   (additive, fakes unaffected); two `const personas =` validation loops in
   `storybook.ts` became `for` loops (lint).

## Known gaps (documented in README — deliberate v1 scope)

- Parent-initiated **illustration re-roll** still creates the placeholder
  candidate the tests pin (`https://example.com/reroll/...`); only the free
  recovery path regenerates through the durable pipeline. Next slice: route
  parent re-rolls through the same Inngest pipeline without breaking
  tests 07/08.
- **Web push** is a no-op until a `push_subscriptions` table + service
  worker registration exist (`PushSubscriptionStore` port already defined in
  `src/adapters/notifications.ts`).
- Training-failure "refund" is copy only.
- `tests/15-…` line 164 has `_book` (renamed for lint) — harmless.

## External blockers (not codeable)

Provider keys (Supabase/Anthropic/fal/R2/Stripe/Inngest/Sightengine/Resend/
AWS), CSAM hash-match vendor + NCMEC relationship (launch gate, ADR-0010),
per-market legal sign-off (ADR-0015/0017). See README "External blockers".

## Suggested skills for the next session

- `/code-review` (high) — the whole one-shot has not had an independent
  review pass yet; that is the single highest-value next action.
- `/tdd` — for the parent-re-roll-through-pipeline slice.
- `claude-api` — only if touching `src/adapters/anthropic.ts` again.
- `/handoff` + `/push-handoff` — at session end.

## First moves for the next agent

1. `git pull`, `npm install --legacy-peer-deps`, run the four checks above.
2. Read `README.md` (5 min) — it now is the orientation doc; this file plus
   `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-11_2.md` give the history.
3. Either run the review pass or pick a known gap. Do not re-litigate the
   DECISIONs listed in README.
