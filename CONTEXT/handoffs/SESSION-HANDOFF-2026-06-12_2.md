# Session Handoff — 2026-06-12 (session 2): native iOS planning + code review

> Planning/decision session on top of the completed web productionization. No app
> code changed; this session produced a code review of the web build, the
> decision to go native iOS, the ADR that authorizes it, and a complete one-shot
> build prompt for the next Fable session. Branch unchanged:
> `handoff/generation-pipeline-prd-v2`.

## What happened this session

1. **Code review (`/code-review`, high)** of the productionization diff
   (`main...HEAD`). Surfaced real bugs the green tests miss because the new
   workflow/route/store layer is under-tested. Top items, in priority order:
   - **Baby Character→Persona promotion is broken in production**
     (`src/workflows/functions.ts:114` hardcodes `kind:"adult"`;
     `PersonaCreatePayload`/`promoteCharacterAction` carry no `kind`). Test 21
     passes only because it calls the service directly, bypassing the workflow.
   - **Hard-delete leaves child PII** — `hardDeleteFamily` (`src/db/store.ts:221`)
     never clears `textStories`, `pendingBriefs`, `moderationAudit`; because
     `SupabaseDataStore.sync()` upserts every map and only deletes ids missing
     from it, the forgotten rows get re-written to Postgres. Erasure violation.
   - **A `failed` book can never be recovered** —
     `finalizeStorybookStatus` (`src/services/storybook.ts:418`) early-returns
     unless status `=== "generating"`.
   - **Selected re-roll dropped + bypasses moderation** — `selectCandidate`
     (`storybook.ts:497`) writes `illustrationUrl`, but reader/export key off
     `illustrationBlobKey`.
   - **Failed persona create strands the persona in `training`** (no status flip
     in the workflow catch); **`pageRecover` has no terminal-failure handler**;
     **text moderation can be bypassed** by a non-numeric class score
     (`moderation.ts:96`); **`sync()` serializes ~34 round-trips per step commit**.
   These are documented inline in the new one-shot prompt's §9 note so they get
   fixed as the shared services are touched. **They are NOT yet fixed.**

2. **`/grill-with-docs`** (partial) — surfaced and resolved the load-bearing
   mobile decisions, recorded in **ADR-0018**:
   - Go **native Expo/React Native** (not a WebView wrapper), reusing the existing
     backend; Next.js stays as backend + web surface.
   - iOS billing = **Apple IAP via RevenueCat** (Stripe stays on web).
   - Parental consent on iOS = **Email-Plus VPC**, decoupled from IAP (because
     Apple IAP can't prove parental identity, so the ADR-0008 "payment = consent"
     mechanism breaks on iOS).

3. **Research** via 4 Haiku subagents (Expo→TestFlight pipeline; IAP/RevenueCat vs
   Stripe/VPC; Supabase-auth/push/deep-linking in Expo; App Store review +
   Kids/COPPA). Findings are baked into the one-shot prompt (credential table,
   architecture, App Store in-code requirements).

4. **Deliverables written:**
   - `CONTEXT/docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md`
   - **`docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md`** — the majestic one-shot for the
     next Fable session: native iOS app + backend Bearer-auth + RevenueCat IAP +
     Email-Plus VPC + push + App Store readiness + EAS config, ending by producing
     an `INTEGRATION-FOR-OPUS.md` runbook and handing the human to Opus for the
     account/signing/submission steps.

## The intended next steps (the user's plan)

1. A **fresh Fable session (or Cursor)** runs `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md`
   end-to-end. It starts with `/grill-with-docs`, writes all code/config, keeps web
   tests green, and stops at the human-account boundary, producing
   `CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md`.
2. **Opus** then walks the user click-by-click through Apple Developer enrollment,
   App Store Connect, the `.p8` keys, EAS build/submit, RevenueCat dashboard,
   subscription products, sandbox/TestFlight IAP testing, App Privacy answers, and
   App Store submission — using that runbook.
3. The user will **buy the Apple Developer Program ($99/yr)** before the Opus step;
   it isn't needed for the code/simulator phase.

## Important context for the next agent

- The native app is a **front-end over the existing backend** — do not fork domain
  logic. The backend gains **Bearer-JWT API routes** mirroring the server actions.
- Fix the code-review bugs (above) while touching the shared services — the native
  app exercises the same Character→Persona, hard-delete, and recovery paths.
- Web orientation doc is `README.md`; web state is
  `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-12.md`.

## Suggested skills for the next session
- `/grill-with-docs` — mandatory Phase 0 of the one-shot prompt.
- `/tdd` — for the new backend surfaces (Bearer routes, RevenueCat webhook, VPC).
- `/code-review` (high) — after the native build, before submission.
- `/handoff` + `/push-handoff` — at session end.

## First moves for the next agent
1. Read `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md` in full, then `README.md`,
   `CONTEXT/CONTEXT.md`, ADR-0018.
2. Run `/grill-with-docs` to resolve monorepo layout, screen mapping, and
   subscription products.
3. Build in the order in the prompt's §10; do not skip the tests or the
   `INTEGRATION-FOR-OPUS.md` deliverable.
