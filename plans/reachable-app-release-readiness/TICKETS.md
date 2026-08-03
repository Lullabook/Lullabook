# PRD v22 ticket set — reachable app release readiness

Parent specification: `CONTEXT/planning/prd-v22-reachable-app-release-readiness.md`
Parent Wayfinder map: GitHub issue #133

These are complete planning drafts. They are not GitHub issues until the whole set has been reviewed, then each is created, added to the Project, assigned a live Project `Status`, and read back. Local IDs continue the repository's issue sequence; the publisher replaces local `Blocked by` references with GitHub issue links after creation.

## 186 — Make Story generation asynchronous and terminal

### What-to-build
Make the production Storybook enqueue boundary durable and non-blocking. A production composition without a usable Inngest dispatch configuration fails closed. Keep local inline execution explicit and development-only. Persist the reservation and `generating` state before dispatch, make duplicate delivery idempotent, and ensure the watchdog/reaper reaches `draft` or `failed`.

### Acceptance criteria

- `POST /api/storybooks` returns a persisted `generating` Storybook in p95 `<2s` without invoking Anthropic or fal in the request.
- Production configuration without a usable durable workflow dispatch returns a typed configuration failure before accepting provider spend.
- One job delivery creates at most one text attempt for its text idempotency key.
- Each `(Storybook, Page, attempt)` idempotency key creates at most one Page attempt, including after replay.
- A worker timeout or provider terminal failure leaves `draft` or `failed`, never stranded `generating`.
- A text failure or watchdog failure releases its Story reservation exactly once.
- The backend owns provider credentials; no client request contains a provider key.

### Verification-command

```bash
npx vitest run tests/186-generation-queue-terminal.test.ts tests/186-generation-production-composition.integration.test.ts && npm run verify
```

### Blocked by

None.

## 187 — Publish generation progress and progressive reader state

### What-to-build
Expose server-derived generation progress and make the native reader useful before every Page is terminal. Add typed errors, a bounded create-request timeout, and a visible retry/continue action.

### Acceptance criteria

- `GET /api/storybooks/:id` returns `progress.phase`, `progress.pagesReady`, and `progress.pagesTotal` for an authorized Family.
- The reader renders Story text and the current server-derived Page count while the Storybook is `generating`.
- A create request stalled beyond 20 seconds shows a retry card and does not leave the Generate control frozen.
- Polling stops on `draft`, `failed`, or `finalized`; a five-minute watchdog renders a terminal timeout state.
- Raw provider/domain error text is not rendered directly; every displayed failure has a typed retry or support action.

### Verification-command

```bash
npx vitest run tests/187-generation-progress-reader.test.ts tests/187-generation-errors.integration.test.ts && npm run verify
```

### Blocked by

186

## 188 — Complete the real Persona training callback lifecycle

### What-to-build
Wire one production Persona-creation protocol from jurisdiction-configured consent and moderation through ZIP submission, signed fal callback, owned artifact copy, review samples, and durable Persona state. `review` is the canonical post-training state before likeness confirmation. Remove reachable legacy success paths and emit the downstream lifecycle event exactly once.

### Acceptance criteria

- A non-Guardian Baby Persona request is denied before any photo is staged or persisted.
- An Adult Persona request without subject self-consent is denied.
- An authenticated Member may create, accept, and retrain only their own subject-linked Adult Persona; another Member cannot create or mutate it. R1 does not introduce invitations.
- Adult Persona creation requires a successful jurisdiction-configured liveness/self-match before staging or training.
- Child-age, consent method, and residency are read from jurisdiction configuration; no legal threshold is hardcoded.
- A verified Baby consent receipt is checked before any source photo is staged.
- A moderation pass is required before any source photo is staged, durably persisted, or submitted; moderator outage fails closed; a failed moderation attempt leaves no staging blob.
- A verified consent receipt is required for a Baby Persona; expiry or revocation denies creation and routes existing child data to the documented purge path.
- A signed successful callback durably persists `training → review` for the correct Persona and stores a Family-owned LoRA key; a provider URL is never stored as an owned key.
- An authenticated Guardian likeness acceptance durably persists `review → likeness-confirmed → Story-ready` and the read API returns the new state after restart.
- An authenticated subject retrain request durably persists `review → training` and cannot be invoked by another Member.
- A Persona in `review` or `training` is rejected before Story spend.
- The implementation maps legacy `ready` to `Story-ready` only when `likeness-confirmed` is true; `failed` is terminal; `review` and `training` are spend-blocked. The mapping is persisted and readable by the production API.
- Callback verification checks timestamp before body hash, parseability, and signature before business dispatch.
- A duplicate callback copies the artifact at most once.
- A stale, malformed, or out-of-order callback leaves lifecycle state unchanged and records a redacted terminal reason.
- A real training failure marks the Persona `failed` with a redacted reason and consumes no Storybook allowance.
- The production composition cannot mark a Persona ready through a fake/local completion path.

### Verification-command

```bash
npx vitest run tests/188-persona-training-lifecycle.integration.test.ts tests/188-fal-callback-idempotency.integration.test.ts && npm run verify
```

### Blocked by

None.

## 189 — Enforce the exact 12-Page Story contract and deterministic placeholder art

### What-to-build
Make the R1 Story contract uniform. Character-only Briefs produce a readable 12-Page draft with deterministic local placeholder art and zero fal image calls. A Brief that selects an unconfirmed Persona is rejected before text/image spend; it is never silently downgraded to placeholder art. Valid Persona Scenes use only selected Personas. Invalid text fails before image spend.

### Acceptance criteria

- Every R1 Storybook contains exactly twelve sequential Pages and Scenes.
- A Character-only Brief produces twelve readable Pages, `draft`, deterministic placeholder art, and zero fal image calls.
- A Brief selecting an unconfirmed Persona is rejected with a typed likeness-gate error before text or image spend.
- Placeholder art contains no raw photo, LoRA, provider URL, or likeness data.
- Invalid schema, missing Style Bible, unselected Persona ID, refusal, or truncation fails before image spend and releases the reservation.
- A failed image Page stays a re-rollable hole and does not fail a valid 12-Page Storybook solely because its illustration is missing; the Story text remains readable.
- A Page re-roll creates a new candidate, preserves prior candidates, and consumes the bounded Storybook re-roll budget.
- A re-roll over the budget returns a typed cap error without a provider call.
- Finalization persists exactly one selected candidate for every Page and rejects a Storybook with an unresolved Page.

### Verification-command

```bash
npx vitest run tests/189-placeholder-art-story-contract.test.ts tests/189-r1-twelve-page-validation.integration.test.ts && npm run verify
```

### Blocked by

186

## 190 — Wire atomic allowance and payable spend authorization

### What-to-build
Make Story allowance, provider cost authorization, ledger persistence, and red kill switches part of the production composition. Use versioned prices and a worst-case reservation before each payable attempt.

### Acceptance criteria

- Two concurrent requests at cap-minus-one yield exactly one successful reservation.
- The losing concurrent request returns typed `story_cap_reached`.
- Text failure releases a reservation exactly once.
- Watchdog reaping releases a reservation exactly once.
- Page repair never reserves a second Storybook.
- Every payable text, image, training, moderation, queue, storage, retry, and repair attempt calls `authorizeSpend` before the provider boundary.
- Every attempt records a non-zero estimated cost from a versioned table.
- Reconciled attempts record actual cost, ownership IDs, request ID, latency, and terminal outcome without prompt/photo/key leakage.
- A persisted red global/provider/model/endpoint switch blocks new payable work after restart.
- Existing drafts remain readable while a red switch is active.
- Hard-delete remains available while a red switch is active.
- Margin is calculated as `(net subscription revenue - attributable COGS) / net subscription revenue * 100`.
- Green variance is `≤5%`, amber is `>5% and ≤10%`, and red is `>10%` or full-cap/P95 margin is below 70%.
- Missing margin evidence fails closed.
- No silent overage or per-Persona allowance multiplication exists.

### Verification-command

```bash
npx vitest run tests/190-spend-boundary.integration.test.ts tests/190-kill-switch-restart.integration.test.ts && npm run verify
```

### Blocked by

186

## 191 — Instrument request, database-wave, and native startup performance

### What-to-build
Add deterministic request timing and query/wave instrumentation plus a dev-only native timing overlay/breadcrumb. Capture a baseline for cold start, authenticated reads, Story detail, and create response without logging secrets or personal data.

### Acceptance criteria

- Authenticated API responses expose `Server-Timing` for auth, hydrate, and total duration.
- The request context records Supabase query count and sequential-wave count.
- Native startup records process-start → interactive and first-read milestones in development only.
- Instrumentation adds less than 10ms to the happy path and logs no token, email, photo key, provider URL, prompt, or credential.
- A checked-in baseline uses the named device/build profile and at least 20 samples per measured path.
- The baseline checker fails unless cold start p95 is `<3s`, create response p95 is `<2s`, Story text p95 is `<25s`, full 12-Page local production-like generation p95 is `<90s`, reader page turn p95 is `<100ms`, and Story detail is `<500KB`.
- The baseline records the timing method, fixture size, sample count, and PASS/FAIL result for cold start, create response, Home, Story list, and Story detail.

### Verification-command

```bash
npx vitest run tests/191-request-performance-instrumentation.test.ts && npm run verify
```

### Blocked by

None.

## 192 — Reduce authenticated read and blob-serving cost

### What-to-build
Split the Supabase read profile from the write/delete profile, remove repeated append-only ledger hydration from ordinary reads, flatten sequential waves, and make image/avatar routes use a minimal authenticated Family lookup. Fix the native roster-avatar bearer request.

### Acceptance criteria

- `/api/home`, `/api/storybooks`, and authorized Story detail use no more than two sequential read waves.
- Write, RLS, and Hard-delete paths still hydrate/inventory every required table.
- Home payload is under 32KB at the R1 roster cap; Story detail is under 500KB and contains no base64 images or provider artifact keys.
- Image/avatar responses set `Cache-Control: private` and never `public`; Family prefix checks remain enforced.
- Roster avatar requests carry the bearer token and fall back once to a placeholder on failure.

### Verification-command

```bash
npx vitest run tests/192-read-hydration-scope.test.ts tests/192-blob-serving-auth-cache.integration.test.ts tests/178-supabase-rls.integration.test.ts && npm run verify
```

### Blocked by

191

## 193 — Bound polling, startup, and screen rendering

### What-to-build
Replace fixed full-payload polling with bounded backoff/ETag behavior, pause background polling, bound auth startup, preserve painted content during refresh, deduplicate Home reads, and remove duplicate route artifacts that enter the Expo tree.

### Acceptance criteria

- A five-minute generation run produces no more than 40 status requests; polling pauses in background and resumes with one fetch.
- An unchanged Story detail returns `304` with an empty body; polling stops at every terminal status.
- Startup auth resolution has a bounded timeout and routes to sign-in instead of holding the splash forever.
- Refresh keeps existing content visible; first-load skeletons do not replace painted content.
- Reachable list screens use virtualized lists for repeatable collections and share/de-duplicate Home data reads.
- Sign-out clears all private in-memory, persisted, and HTTP caches before another Family can be read.
- Duplicate route/source artifacts are removed or excluded and the dead-surface gate passes.

### Verification-command

```bash
npx vitest run tests/193-polling-startup-render.test.ts tests/149-dead-surface-sweep.test.ts && npm run verify
```

### Blocked by

192

## 194 — Make production entitlement and RevenueCat lifecycle real

### What-to-build
Replace the fake-only purchase path with a real RevenueCat seam for native builds, persist webhook events through one hydrated context, add restore and subscription lifecycle handling, and derive every client/server surface from `R1_PLAN_DEFINITION`.

### Acceptance criteria

- A sandbox purchase or trial updates server entitlement only after verified RevenueCat evidence; an unresolved purchase never unlocks a paid action.
- RevenueCat webhook handling uses one hydrated/persisted context, verifies signature, deduplicates event IDs, binds `app_user_id` to the owning Family, and never returns 500 for a known lifecycle event.
- Refund, billing issue, expiration, product change, uncancellation, and restore-purchase behavior are explicit and tested.
- The native build contains the RevenueCat dependency only in a native-capable profile; no external payment link or provider secret reaches Expo.
- All prices, cap values, and capability flags derive from the accepted R1 plan definition; stale `$9.99/$79.99` and eight-Story values are unreachable.
- Trial usage has a bounded allowance/spend ceiling and cannot train/generate unlimited provider work for zero revenue.

### Verification-command

```bash
npx vitest run tests/194-revenuecat-lifecycle.integration.test.ts tests/194-r1-plan-single-source.test.ts && npm run verify
```

### Blocked by

190

## 195 — Prove the production-like reachable-app release gate

### What-to-build
Build one deterministic and explicitly opt-in live gate for the reachable native surface. It must exercise the real composition boundary, not only isolated service fakes, and must publish evidence for provider IDs, cost, failures, RLS, Hard-delete, and cut surfaces.

### Acceptance criteria

- Deterministic gate covers sign-in, entitlement, consent, Character/Persona creation, Story enqueue, Bedtime and Learning text, twelve Pages, reader/finalize/PDF, Journal/Daily Notes, failure/recovery, RLS, and Hard-delete.
- A native Simulator/TestFlight smoke proves the same reachable flow without dev subscription, fallback, liveness, demo, or seed bypasses.
- Real-provider mode requires explicit approval, a positive hard budget, synthetic/consenting-adult fixtures, new server-only credentials, and provider request IDs; it refuses otherwise.
- Reports redact JSON/nested credentials, prompts, raw-photo content, and provider URLs; synthetic IDs/costs cannot become release-eligible.
- The gate proves one two-persona flow only if real owned LoRA artifacts are ready; otherwise it reports the exact blocked step and does not claim release readiness.
- The release-profile bundle/config scan fails if it contains provider keys, privileged Supabase keys, `EXPO_PUBLIC_DEV_PASSWORD`, `DEV_FORCE_SUBSCRIPTION`, `DEV_LIVENESS_BYPASS`, `DEV_FAL_FALLBACK`, demo-seed enablement, or equivalent bypasses.
- Journal/Daily Notes capture and timeline are required reachable flows and must pass; deferred heavy Journal machinery is covered by the dead-surface gate.
- Cut audio, video, invitations, and Share-link surfaces remain inert and are covered by the dead-surface gate.

### Verification-command

```bash
npx vitest run tests/195-reachable-release-gate.test.ts tests/195-native-gate-contract.test.ts && npm run verify
```

### Blocked live-evidence gate

The native Simulator/TestFlight and real-provider commands are not part of deterministic verification. Missing native build, real request IDs, actual billing reconciliation, RLS, Hard-delete, or provider evidence must exit non-zero and report `BLOCKED`, never `PASS`.

The separate `$10` bakeoff evidence from existing Wayfinder #150 is required for model/routing selection and requires fresh approval:

```bash
LIVE_PROVIDER_RUN_APPROVED=true LIVE_PROVIDER_BUDGET_USD=10 npm run smoke:provider-bakeoff
```

The final native/provider smoke is separate and requires a second fresh approval:

```bash
LIVE_PROVIDER_RUN_APPROVED=true LIVE_PROVIDER_BUDGET_USD=2 npm run smoke:r1-provider-e2e
```

### Blocked by

Wayfinder #135, Wayfinder #150, 187, 188, 189, 190, 193, 194

## 196 — Configure the Super.Engineering current-workspace iOS launcher

### What-to-build
Add a safe launcher script/configuration for the Super.Engineering Run button. It must use `$SUPERCONDUCTOR_WORKSPACE_PATH`, start the selected local backend, start the IPv4 Metro proxy, wait for readiness, then invoke `mobile`'s iOS launch command so the Simulator opens the latest workspace code. It must clean up child processes on exit and never carry provider secrets.

### Acceptance criteria

- The launcher resolves the current workspace from `$SUPERCONDUCTOR_WORKSPACE_PATH` and refuses a missing or non-Lullabook workspace.
- It starts the backend on the port consumed by the mobile launch profile, waits for an HTTP readiness response, starts `mobile/scripts/ipv4-metro-proxy.mjs`, and invokes the iOS Simulator command.
- Super.Engineering Run configuration contains one documented command sequence and no hardcoded personal path.
- The launcher uses only development credentials already defined by the mobile dev profile; no provider key is echoed, stored, or passed to Expo.
- SIGINT/SIGTERM cleanup stops backend, proxy, and Metro children; a failed readiness check exits non-zero.
- The command is documented for a newly created worktree and passes a shell/script contract test without requiring a live provider.

### Verification-command

```bash
npx vitest run tests/196-super-engineering-ios-launcher.test.ts && npm run verify
```

### Blocked by

None

## 197 — Final hard-delete/RLS and human release evidence reconciliation

### What-to-build
Run the final human-owned evidence pass after the deterministic gate. Reconcile actual provider billing, Apple/RevenueCat/EAS evidence, PostgreSQL RLS, Hard-delete after restart, cache/CDN/backup retention, provider-deletion limitations, and the complete reachable-feature smoke matrix. This ticket does not silently deploy or submit the app.

### Acceptance criteria

- The evidence packet identifies every reachable flow as PASS, FAIL, or BLOCKED with repro steps and command output.
- PostgreSQL authenticated Family A/B tests prove cross-Family denial on the actual policies, not only in-memory guards.
- Hard-delete inventories and removes database rows.
- Hard-delete removes blobs, derivatives, and context artifacts.
- Hard-delete removes provider-owned artifacts where the provider contract permits deletion.
- When a provider, cache, CDN, backup, or retention queue cannot delete immediately, the evidence records the exact retention limitation, owner, expiry/retention window, retry behavior, and user-visible status; inventory alone is insufficient.
- Hard-delete inventories and attempts deletion of private caches, CDN copies, backups, and retention queues.
- Family-owned moderation evidence retains the owning `family_id`, remains RLS-protected, and is removed or covered by an explicit documented retention exception.
- A repeat after process restart is idempotent.
- Actual provider charges reconcile to request IDs and the approved budget.
- No live run uses the compromised keys or minor photos.
- A human signs the App Store/RevenueCat/EAS/legal/privacy checklist, or each missing item becomes a named follow-up.
- No `Done` claim is made from deterministic tests alone.

### Verification-command

```bash
npx vitest run tests/197-production-rls-delete-evidence.test.ts && npm run verify
```

### Blocked by

195
