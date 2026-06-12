# Session Handoff — 2026-06-11 (session 2): PRD v2 productionization one-shot, ~35% complete

> For the next agent (planned: Fable 5, high effort, fresh session). The
> session executed `docs/FABLE-ONESHOT-PROMPT.md` — the full "make Lullabook
> real" one-shot — and was stopped deliberately partway. Everything below is
> uncommitted on branch `handoff/generation-pipeline-prd-v2`. **All 87 tests
> pass** (`npm test`) with the changes in place; verified immediately before
> this handoff.

## The mission (unchanged)

Execute `docs/FABLE-ONESHOT-PROMPT.md` end to end: real adapters behind every
port, Supabase Postgres + RLS, Inngest durable generate workflow, full API
layer, complete bedtime-design UI, webhooks/notifications, `.env.example` +
README, new tests. That prompt is the authoritative spec — read it first, then
`CONTEXT/CONTEXT.md`, `CONTEXT/planning/stack.md`,
`CONTEXT/planning/prd-v2-generation-pipeline.md`, and ADRs 0004/0005/0007/
0008/0010/0011/0012/0013/0015/0016/0017. Hard constraints (87 tests green,
adapter-port seam, per-Family RLS, moderation-before-persist, deterministic
workflow keys, re-roll cost split, failed floor, subscription gate, consent
rules, hard-delete across both stores) all still bind.

## What is DONE (uncommitted, working)

### 1. Full Postgres schema + RLS — `supabase/migrations/002_full_domain.sql`
Every entity in `src/domain/types.ts` (characters, light/full consent
receipts, subscriptions, storybooks + `classic_id`, pages, page_candidates,
persisted_generations, text_stories, share_links, moderation_audit
(service-role only, zero policies by design), banned_accounts, invites,
pending_briefs, purge_schedule, jurisdiction_configs with seed rows). Helpers
`app_current_family_id()` / `app_current_member_id()` / `app_is_guardian()`
(SECURITY DEFINER). RLS on every table; draft Storybooks visible only to
creator; Guardian-only writes enforced in policies. Extends 001 (alters
personas with `promoted_from_character_id`, `questionnaire`).

### 2. Real adapters — `src/adapters/*.ts` (all new files)
- `env.ts` — lazy `requireEnv`/`optionalEnv` (build/tests never need secrets).
- `anthropic.ts` — `RealAnthropicAdapter`, model **`claude-sonnet-4-6`**,
  structured output via `output_config.format` json_schema (SDK 0.104.1
  supports it — verified). One pass → Story + Scenes + Style Bible; wardrobe
  travels as array-of-pairs on the wire (structured outputs can't do
  `Record<string,string>`) and is folded back. `generateTextStory` (traits →
  prose) and `adaptStory` (classics, plot-beats-preserving) included;
  instruction set branches on `storyType` (bedtime vs learning); handles
  `stop_reason: "refusal"`.
- `fal.ts` — `RealFalAdapter` via fal queue REST (fetch, no SDK — DECISION).
  Flux LoRA train/infer/inpaint endpoints + Gemini ref-model fallback
  (ADR-0005 sequential inpaint loop implemented). Forwards
  `X-Fal-Idempotency-Key`; fetches bytes immediately (moderation needs bytes);
  training submit takes `FAL_WEBHOOK_URL`.
- `moderation.ts` — `RealModerationAdapter`: CSAM hash-match layer FIRST
  (configurable endpoint `CSAM_HASH_API_URL`, fails closed, returns
  `csamDetected` so ChildSafetyService escalates HITL/NCMEC), then
  Sightengine image/text classifiers (DECISION).
- `blob-store.ts` — `R2BlobStore` (@aws-sdk/client-s3; R2 endpoint or plain
  S3 + SSE), full `BlobStore` port + `deletePrefix` (hard-delete) +
  `signedUrl()` resolver (15-min TTL) for serving Page blob keys.
- `inngest.ts` — `inngest` client (id "lullabook"), `EVENTS` map,
  `InngestWorkflowAdapter`: `enqueue` sends event from the new serializable
  payload (see §3), collects send promises for `flush()`; `run()` maps
  WorkflowSteps → `step.run(idempotencyKey)` via AsyncLocalStorage-bound
  `DurableStepTools` (structural type); steps named `wait-*` are NOT wrapped
  (Inngest forbids nested step tools — their durability is the inner
  `step.waitForEvent`); `waitForEvent` → `step.waitForEvent` matching
  `async.data.jobId`; `runWithStepContext(step, fn)` binds the context.
- `stripe.ts` — `RealStripeAdapter` + `getStripeClient()`; checkout session
  carries `familyId` in metadata (payment-VPC, ADR-0008).
- `classic-catalog.ts` — `CuratedClassicCatalog` + `CURATED_CLASSICS`: Alice,
  Peter Rabbit, Goldilocks, Three Little Pigs (legalConfirmed: true), Ugly
  Duckling (`legalConfirmed: false` — demonstrates the legal gate; `getById`
  refuses unconfirmed entries; `listAvailable()` for the picker UI).
- `notifications.ts` — Resend email via fetch + `web-push` VAPID
  (DECISION); takes optional `PushSubscriptionStore` interface (NOT yet
  implemented anywhere — next session must add a `push_subscriptions` table +
  store impl + service-worker registration, or ship email-only).
- `pdf.ts` — `PdfLibAdapter` (pdf-lib, DECISION): cover page + per-page
  layout, bedtime palette, fetches illustration via signed URL.
- `liveness.ts` — `RekognitionLivenessAdapter` (CompareFaces, weakest-match
  decides, threshold 90 — DECISION; swap for a real liveness vendor later
  behind same port).

### 3. Service/port refactor for durability (tests still green)
- `src/adapters/types.ts`: `WorkflowAdapter.enqueue` gained optional third
  param `payload?: WorkflowJobPayload` (`storybook-generate` |
  `page-recover` discriminated union). Fakes unchanged.
- `src/domain/types.ts`: `Storybook.classicId?: string`.
- `src/services/storybook.ts`:
  - `generate()` / `generateFromClassic()` enqueue closures now just call new
    **public** `runGenerationBody(memberId, storybookId)` and pass the
    serializable payload; the body reconstructs brief/personas/note from
    persisted state and branches original-vs-classic on `storybook.classicId`.
  - `recoverPage()` → enqueues new **public**
    `runRecoveryBody(memberId, pageId, attempt)` with payload.
  - `runGeneration()` no longer reads the in-process `generated` local after
    the claude-pass step — it re-reads `getPersistedGeneration()` (replay
    correctness; this also fixed a latent at-least-once bug where a replayed
    drain flipped a finished book to `failed`).

### 4. Supabase store — `src/db/supabase-store.ts`
`SupabaseDataStore extends DataStore`, per-request unit of work (DECISION):
`hydrateFamily()` loads one Family's full row graph into the in-memory maps
(also `hydrateByAuthUser` / `hydrateByMemberId` / `hydrateByShareToken` /
`hydrateInvite` / `listPurgeDueFamilyIds`); services run unchanged; `sync()`
diff-syncs (upsert everything in scope, delete rows present in the hydration
snapshot but gone from the maps — children before parents). Postgres RLS is
the hard boundary; in-memory RLS checks stay as defense-in-depth.

### 5. Dependencies installed (use `--legacy-peer-deps` — inngest has a vite
peer conflict with vitest 3): `@anthropic-ai/sdk@0.104.1`,
`@supabase/supabase-js`, `@supabase/ssr`, `inngest@4.5.1`,
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
`@aws-sdk/client-rekognition`, `pdf-lib`, `web-push` (+ `@types/web-push`).

## What REMAINS (in build order, per the one-shot prompt §4)

1. **Composition root + auth** (was literally next):
   `src/lib/supabase.ts` (anon/cookie client via @supabase/ssr + service-role
   client), `src/lib/context.ts` (build all services with real adapters +
   fresh `SupabaseDataStore` per request; expose `store.sync()` and
   `workflow.flush()`), `src/lib/auth.ts` (auth user → hydrated Member).
2. **Inngest functions** — `src/workflows/functions.ts` + serve route
   `src/app/api/inngest/route.ts`:
   - `storybook-generate` on `lullabook/storybook.generate.requested`:
     build ctx → hydrate → `runWithStepContext(step, () =>
     storybooks.runGenerationBody(...))`; **sync the store after every
     committed step** (planned: `onStepCommitted` hook on
     `InngestWorkflowAdapter` calling `store.sync()` — NOT yet added to the
     adapter); try/catch → mark book `failed` + sync on unhandled error.
   - `page-recover` on `lullabook/page.recover.requested` → `runRecoveryBody`.
   - `persona-create` on `lullabook/persona.create.requested` (route uploads
     photo buffers to blob store first, event carries keys; function loads
     buffers, calls `personas.createAdult/createBaby` or
     `characters.promoteToPersona`; the `wait-for-training` step parks on
     `step.waitForEvent` via the adapter; PersonaService itself unchanged —
     tests in 15/16 require `createAdult` to complete synchronously w/ fakes).
   - cron `scheduled-purges` (daily): `listPurgeDueFamilyIds` → hydrate each →
     `hardDelete.runScheduledPurges()` → sync (export-then-purge, ADR-0007).
3. **API routes/server actions + webhooks**: thin-request generate endpoints
   (validate → service → `await workflow.flush()` + `store.sync()` → return
   `generating` book), Stripe webhook (checkout.completed →
   `handleCheckoutCompleted`; signature verify), fal training webhook →
   `inngest.send(EVENTS.falTrainingComplete, {jobId, status, loraWeightKey})`,
   signed-URL image resolver route (Page blob key → `R2BlobStore.signedUrl`),
   share route with `X-Robots-Tag: noindex, nofollow` headers, Supabase auth
   callback, export-PDF route, hard-delete action.
4. **Full UI surface** (biggest remaining chunk) — everything in prompt §2C:
   design tokens/globals.css (bedtime identity, mobile-first, WCAG AA),
   onboarding/auth, Character questionnaire + free text Story flow + reading
   view, Persona creation (adult selfie, baby Guardian+VPC) + likeness
   confirmation, Character→Persona upgrade, Brief composer + live progress
   (poll book status; failed/quarantined Pages as re-rollable holes),
   classics picker, curation (candidates, independent text/image re-roll,
   budget display, finalize), library shelf + page-turn reader, sharing
   (mint/revoke/expiry/passcode + likeness warning), export, billing
   (checkout/cancel → export-then-purge messaging), account privacy +
   hard-delete confirm, cold-start empty states.
5. **Glue**: `.env.example` (vars referenced so far: ANTHROPIC_API_KEY,
   FAL_API_KEY, FAL_WEBHOOK_URL, SIGHTENGINE_API_USER/SECRET,
   CSAM_HASH_API_URL/KEY (optional), BLOB_S3_ENDPOINT/REGION/BUCKET/
   ACCESS_KEY_ID/SECRET_ACCESS_KEY, STRIPE_SECRET_KEY/STRIPE_PRICE_ID (+
   webhook secret when route built), RESEND_API_KEY, EMAIL_FROM,
   VAPID_PUBLIC/PRIVATE_KEY, VAPID_SUBJECT, AWS_ACCESS_KEY_ID/
   SECRET_ACCESS_KEY, AWS_REKOGNITION_REGION, NEXT_PUBLIC_APP_URL, plus
   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
   SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY/SIGNING_KEY); README run/
   deploy section; new tests for each real adapter (mock fetch/SDK; service-
   seam style) + SupabaseDataStore sync test with a stub client; `npm test`,
   `npm run build`, `npm run lint` all green.

## Known gotchas / decisions already made (don't re-litigate)

- **claude-api skill says default Opus** — overridden: stack.md locks
  `claude-sonnet-4-6` for story text. Keep it.
- Structured outputs: no free-form maps; wardrobe wire format already handled.
- Inngest `enqueue` is sync at the port → adapter buffers sends; **request
  handlers must `await workflowAdapter.flush()`** before responding.
- `wait-*` step names bypass `step.run` wrapping (nested-step-tools rule);
  post-wait mutations may re-run on replay → keep them idempotent (emails may
  rarely duplicate — accepted v1).
- SupabaseDataStore assumes one family + single writer per request; workflow
  steps each do hydrate→run→sync.
- Tests access `ctx.store` maps directly — never change the in-memory
  `DataStore` API, only extend.
- `npm install` needs `--legacy-peer-deps`.
- Typecheck (`npx tsc --noEmit`) was NOT run after the last few files —
  run it first; fix any drift before continuing.

## Suggested skills for the next session

- `/tdd` — for the new adapter tests (red-green-refactor, service-seam style).
- `/code-review` (high) — after the build completes, before handoff.
- `claude-api` — already consulted this session; re-invoke only if touching
  the Anthropic adapter again.
- `/handoff` + `/push-handoff` — at session end.

## First moves for the next agent

1. `git status` — confirm the uncommitted file set above; `npm test` (87) and
   `npx tsc --noEmit`; fix any type drift.
2. Commit the completed work as a checkpoint ("PRD v2 one-shot part 1:
   migrations + real adapters + durable-body refactor + Supabase store").
3. Read `docs/FABLE-ONESHOT-PROMPT.md` + this doc, then resume at "What
   REMAINS" step 1 and run the remaining order without stopping.
