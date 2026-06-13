# Session Handoff — 2026-06-13: native iOS, one-shot → sliced workflow

> Planning session. **No app code changed.** Fable became unavailable (US
> restriction), so the native iOS effort was switched from a Fable one-shot to the
> normal workflow: `grill-with-docs → to-prd → to-issues`. The web code Fable
> already wrote **stays** (105 tests green). The native build now goes to **Cursor
> Composer 2.5** (TDD). Branch unchanged: `handoff/generation-pipeline-prd-v2`.

## What happened this session

1. Read all of `CONTEXT/` + the native one-shot
   (`docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md`) + ADR-0018.
2. Ran **`/grill-with-docs`** — resolved 11 load-bearing decisions (table below).
3. Updated **`CONTEXT/CONTEXT.md`** — added glossary entries **Email-Plus VPC** and
   **Subscription** (the free/paid gate line).
4. Wrote **`CONTEXT/planning/prd-v3-native-ios.md`** (PRD v3, parent = prd-v2).
5. Broke it into **issues `23`–`31`** in `CONTEXT/issues/` (dependency-ordered
   vertical tracer-bullet slices, money-first).

## The 11 locked decisions (full reasoning in PRD v3)

| # | Decision |
|---|---|
| 1 | Tracer-bullet vertical slices, not one monolith |
| 2 | 8 web code-review bugs fixed inside the native slice that touches each service |
| 3 | Next.js stays at repo root untouched; `/mobile` Expo app; share **types only** via `@domain/*` path alias + Metro watchFolders |
| 4 | iOS-only; code kept cross-platform-clean |
| 5 | Paywall: one entitlement `active`; monthly + annual; **no trial** (free text tier is the trial) |
| 6 | Gate line = **illustration + Personas**; free = Character → text Stories; subscribe + photos + Email-Plus VPC → promote to Baby Persona → unlocks everything |
| 7 | Baby Persona (core pitch) is in the first paid release |
| 8 | Email-Plus VPC: link-confirm + **delayed second email w/ revoke**; version-stamped receipt; `consentMethod = email_plus` |
| 9 | Web untouched — keeps Stripe-as-VPC legacy; `email_plus` added to the **shared** consent engine, mobile-only |
| 10 | Live gen progress: reuse web's poll of `GET /api/storybooks/[id]` (Bearer); realtime deferred |
| 11 | Auth: Supabase email/password **+ Sign in with Apple** |

## Money-first slice order (issues)

`23` native auth + Bearer backend (→ first TestFlight) → `24` free Character text /
`25` IAP paywall → **`26` Email-Plus VPC + Baby Persona + first illustrated book
(App Store submit point, first money)** → `27` curation/library/reader → `28`
Adult/multi-Persona/Brief → `29` Classics/sharing/export → `30` push/account/
hard-delete → **`31` App Store readiness + `INTEGRATION-FOR-OPUS.md` (HITL)**.

8-bug fold-in is mapped per issue (see each issue's "Bug fix" acceptance criteria
and the PRD's *Bug fold-in* section).

## Test seams (already verified against code)

- Bearer auth → new `requireBearerMember(req)` (JWT verify → Member) feeding the
  unchanged `createRequestContext()`; faked JWT verifier.
- RevenueCat webhook → existing `SubscriptionService.activate/cancel`.
- Email-Plus VPC → new `email_plus` `ConsentMethod` + VPC state machine over the
  Resend `NotificationAdapter`.
- Push → implement existing `PushSubscriptionStore` port + `expo-server-sdk`.
- No React Native render-detail tests; verify the app in the iOS simulator.

## First moves for the next agent (Cursor Composer 2.5)

1. Read `CONTEXT/planning/prd-v3-native-ios.md`, then `CONTEXT/CONTEXT.md`,
   ADR-0018, and `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md` (full screen inventory +
   credential table reference).
2. Start at **`CONTEXT/issues/23-native-auth-bearer-backend.md`** and follow the
   `Blocked by` chain.
3. Build **TDD** (red → green). Keep the **105 web tests green**; run
   `npx tsc --noEmit` + lint for root **and** `mobile/` before declaring a slice
   done.
4. Issue `31` is **HITL** — Cursor writes all code/config and the
   `INTEGRATION-FOR-OPUS.md` runbook; **Opus** then walks the human through Apple /
   RevenueCat / App Store Connect account + signing + submission.

## Suggested skills for the next session

- `/tdd` — the intended implementation mode; start at issue 23.
- `/code-review` (high) — after each slice / before submission.
- `/grill-with-docs` — only if a new open question surfaces.
- `/handoff` + `/push-handoff` — at session end.
