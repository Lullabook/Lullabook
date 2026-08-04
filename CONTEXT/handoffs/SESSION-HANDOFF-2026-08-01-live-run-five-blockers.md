# Session Handoff — Live run of the app, five production blockers fixed

**Date:** 2026-08-01
**Branch:** `fix/lul-100-debugger-debugger-ready` (tip at session start `83bb029`)
**Worktree:** `~/Work/Lullabook` (mainline checkout, not a stage worktree)
**Mode:** Ad-hoc live run + repair. Not a `/coder` or `/debugger` ticket run. No tracker moves.
**Trigger:** "run the dev server, give me full access, I want to fully test the app so I can release it to the App Store."

## Summary

Bringing the app up live against the real Supabase project and the real Anthropic
API surfaced **five blockers that the deterministic suite could not see**, because
each one lives in the gap between the tested seam and the production wiring —
the same class the 2026-07-21 debug audit describes.

All five are fixed test-first. `npm run verify` PASS (172 files / 971 tests).
The R1 core loop now runs end to end for the first time: a Brief generates a
12-Page `draft` Storybook with real Sonnet text, persisted and readable.

**These five are separate from, and do not clear, the six blockers in
`DEBUG-AUDIT-2026-07-21-r1-176-185.md`.** Those remain open.

## Environment brought up

| Item | Detail |
| --- | --- |
| Next.js API + web | `npm run dev:all` → port 3002 (new script) |
| Metro | port 8081, via `mobile/scripts/ipv4-metro-proxy.mjs` (Metro binds `[::1]` only on this machine) |
| Expo app | iPhone 17 Simulator, signed in as `simulator@lullabook.dev` |
| Supabase | project `pavdmqbwphqevaansxcs`, resumed from pause |

Two environment repairs were needed before any feature could run:

1. **The Supabase API keys had been rotated.** The legacy anon/service-role JWTs
   in `.env.local` and `mobile/.env` were dead — the app surfaced this as
   `fetch failed: A server with the specified hostname could not be found`,
   which reads like DNS but was not. Replaced with the new
   `sb_publishable_…` / `sb_secret_…` pair. Backups at `.env.local.bak`,
   `mobile/.env.bak`.
2. **The database was 11 migrations behind** (at `011`; repo has `022`).
   `hydrateFamily()` reads 9 tables, three of which did not exist, so **every**
   API request 500'd. Generated `CONTEXT/local-dev/schema-catchup-012-022.sql`
   and applied it.

   > `npm run db:migrate` and `CONTEXT/local-dev/RUN-LOCAL.md` are **stale** —
   > both stop at migration 012 and would have left the project broken. The
   > in-code error message pointed at the same wrong file; corrected.

### New: `npm run dev:all`

Everything `dev:paid` sets, plus `R1_AUDIO_ENABLED`, `R1_MULTI_FAMILY_ENABLED`,
`R1_JOURNAL_MACHINERY_ENABLED`; dist dir `.next-all`, port 3002. Mirrored into
`mobile/.env` as the `EXPO_PUBLIC_*` equivalents.

> **Dev-only.** `DEV_FORCE_SUBSCRIPTION` and the `R1_*` uncut flags must never
> reach a TestFlight or App Store build. The existing `RUN-LOCAL.md` warning
> applies unchanged to this script.

## Blockers fixed

Each has a test whose header records the live repro.

### 1. Email-Plus consent could never be confirmed — COPPA gate unreachable

`POST /api/consent/email-plus/confirm` built a fresh `createRequestContext()`
and called `confirmConsent(token)` immediately. That store starts **empty** and
the route never hydrated it, so the scan of `emailPlusVpcRequests` always missed
and every confirm returned `400 Invalid or expired consent link`.

The link is unauthenticated by design — the token is the only handle onto the
Family — so there was no other path in. Email-Plus is the **required** consent
method on iOS (ADR-0018), so no Family could ever reach `consent_verified` and
`requireConsentVerified` blocked every Baby Persona creation. The whole R1 entry
flow dead-ended at consent.

- Fix: `SupabaseDataStore.hydrateByConsentToken(token)`; route calls it first.
- Gate: `tests/email-plus-confirm-hydration.test.ts` (3 tests)
- Live: request → 200 `link_sent`, confirm → 200 `confirmed`, status → `verified`.

### 2. Story generation always failed at the provider

`MAX_TOKENS` is 24000. Three call sites used non-streaming
`client.messages.create`, and the Anthropic SDK **refuses** a non-streaming
request that large:

```
Streaming is required for operations that may take longer than 10 minutes.
```

So the single R1 promise — generate one illustrated Bedtime Story — could not
succeed against the real provider at all. The suite never caught it because the
fake adapter has no such ceiling; only the real SDK enforces it.

- Fix: the three large call sites use `client.messages.stream(...).finalMessage()`.
  The ~80-token avatar-blurb call stays non-streaming.
- Gate: `tests/anthropic-streaming-required.test.ts` (3 tests)
- Also updated the three existing stubs (`real-anthropic`, `162`, `181`) to the
  streaming shape; both verbs route through the same mock so their
  call-argument assertions are unchanged.

### 3. Character-only Briefs always failed the likeness contract

`castLine` emits a `CAST PERSONA IDS` line only when `personaIds` is non-empty.
For a Character-only Brief the model was told nothing about the field, but the
schema still requires it — so it invented IDs, and every Scene tripped
`Scenes may use selected Persona IDs only`.

That check is a real likeness boundary (a Persona ID in a Scene is what routes a
real person's LoRA into an illustration) and is **unchanged**. The defect was
the prompt steering the model into violating it. This blocked PRD v19's
"Placeholder art": a persona-free Brief is supposed to yield a text-viewable
draft, never a failure.

- Fix: on the no-Persona branch, instruct an empty `personaIds` per Scene and a
  `wardrobe` keyed by Character name.
- Gate: `tests/anthropic-character-only-cast.test.ts` (3 tests, two of which pin
  that the boundary still rejects an unselected Persona ID)

### 4. A stale `selectedBabyId` permanently broke Storybook creation

A Member row carried `selected_baby_id` pointing at a Baby that does not exist.
`normalizeBrief` copies it onto the Brief unchecked, so every generation reached
`sync()` and died on `storybooks_baby_id_fkey`. No UI action could clear the
pointer — the Household was permanently unable to make a Storybook.

- Fix: `resolveBabyId()` keeps the id only when the Baby resolves; otherwise
  degrades to "no Baby".
- Gate: `tests/storybook-dangling-selected-baby.test.ts` (2 tests)

### 5. Every generated Story stranded in `generating` with zero Pages

`persist()` ran `store.sync()` **then** `workflow.flush()`. In local dev the
adapter is `LocalDevWorkflowAdapter`, whose `flush()` calls `drain()` — it runs
the queued generation **inline, against this same store**. The terminal status
and all 12 Pages therefore landed *after* the only sync and were silently
dropped. `POST` returned `{"status":"draft"}` (read from memory) while the row
said `generating` and `pages` stayed empty forever.

Direct violation of the Generation terminal state invariant (CONTEXT.md:
*"always ends `draft`|`failed`, never stranded in `generating`"*).

The ordering is **correct** for production — `InngestWorkflowAdapter.flush()`
only sends events, and a remote worker must not read uncommitted state. So the
fix is not a swap.

- Fix: a second `store.sync()` after flush, gated on
  `workflow instanceof LocalDevWorkflowAdapter`. Production pays nothing.
- Gate: `tests/persist-inline-workflow-ordering.test.ts` (4 tests, incl. one
  pinning that the pre-flush sync survives)

## Relationship to the 2026-07-21 audit

Blockers **4 and 5 are both symptoms of finding 178-MAJOR** ("production
persistence is not transactional" — `sync()` upserts each table independently
with no boundary). Two symptoms are fixed; **the transaction boundary is not.**
Expect more of this shape until it is addressed.

## Verification

```bash
npm run verify
```

```
✓ Typecheck (root)   ✓ Typecheck (mobile)   ✓ Vitest (172 files / 971 tests)
✓ Sentry check       ✓ Dead-surface (149)   ✓ Deterministic seed (153)
— Playwright: SKIP (no server)
PASS
```

Live, against real Supabase + real Anthropic:

| Flow | Result |
| --- | --- |
| Sign-in (web + native) | PASS |
| `GET /api/{home,storybooks,entitlement,account,paywall-config}` | 200 |
| Email-Plus request → confirm → status | PASS (`verified`) |
| Create Character (fictional guard + array-field contract) | PASS |
| `POST /api/storybooks` → read back | **PASS — `draft`, 12 Pages, real text, persisted** (~40 s) |

## Not verified — do not assume these work

- **Persona creation and photo upload.** Last observed state was
  `Upload failed (500)`, from *before* the fixes; not retested. Also exercises
  fal LoRA training, never run.
- **Illustrations.** Pages carry text; `illustrationUrl` is empty under
  `DEV_FAL_FALLBACK`. Text-viewable draft is the PRD v19 contract, so this may
  be correct — unconfirmed.
- PDF export, share links, hard-delete, Journal/Moments, audio, re-roll.

## Not release-done

The six blockers in `CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md`
stand. Highest priority before any submission:

- **179** — `src/app/api/webhooks/fal/route.ts` has no signature/timestamp/body-hash
  check and forwards the provider URL as `loraWeightKey`. Live security boundary.
- **178** — production writes source photos to durable `staging/…` blobs *before*
  moderation; the tested `createAtomic` path is dead code. COPPA/child-safety.

## Recommended next action

1. Retest the Persona/photo path now that consent and persistence work.
2. Then **179** and **178**.
3. Then the `sync()` transaction boundary, which keeps producing blockers 4/5.

## Incidental

- `next-env.d.ts` and `tsconfig.json` churn is Next dev-server generated
  (`.next-all` types from the new script).
- `.gitignore` gained `.next-all/` and `codex-native-selector/`.
- Added a project `CLAUDE.md` at the user's request: report to the user in
  ASD-STE100 Simplified Technical English (does not apply to code, comments,
  commit messages, or `CONTEXT/` docs).
- `tests/178-atomic-consent-safe-persona.test 2.ts` is a stray duplicate in the
  tests dir; left alone.
