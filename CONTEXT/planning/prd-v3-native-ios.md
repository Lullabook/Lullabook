# PRD v3 — Native iOS app (Expo / React Native) over the existing backend

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2 — generation pipeline](./prd-v2-generation-pipeline.md)
- Implementer: **Cursor Composer 2.5**, TDD (not a Fable one-shot). Build in the
  dependency-ordered slices below; keep all existing web tests green throughout.
- Refs (ADRs): [0008](../docs/adr/0008-verifiable-parental-consent.md),
  [0009](../docs/adr/0009-subscription-monetization.md),
  [0010](../docs/adr/0010-child-safety-defense-in-depth.md),
  [0011](../docs/adr/0011-backend-architecture.md),
  [0015](../docs/adr/0015-multi-jurisdiction-launch.md),
  [0016](../docs/adr/0016-character-tier-two-tier-consent.md),
  [0018](../docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md) (authorizes
  this whole effort).
- Glossary terms: Email-Plus VPC, Subscription, Character, Persona/Baby/Adult,
  Trait Questionnaire, Storybook, Page, Brief, Style Bible, Consent receipt,
  Jurisdiction, Hard-delete, Share link, Export.
- Source: the `grill-with-docs` session of 2026-06-13 and
  `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md` (the original one-shot, now decomposed
  into slices because Fable is unavailable).

## Problem Statement

The product is a complete, productionized **web app** (Next.js + Supabase +
Inngest + Anthropic/fal pipeline; 105 tests green) but has **no native mobile
presence**. A parent cannot install it from the App Store, cannot pay on their
phone, and cannot use native camera/push. The fastest route to revenue is a
**native iOS app** that reuses the existing backend untouched and turns the
free→paid funnel on inside the App Store.

Two facts force specific design (ADR-0018): (a) Apple Guideline 3.1.1 requires
in-app digital subscriptions to bill via **Apple IAP** — the Stripe web checkout
cannot ship inside the app; and (b) Apple IAP never reveals the payer's identity,
so the web "payment = consent" VPC mechanism (ADR-0008) **cannot** prove parental
consent on iOS. A payment-independent consent path is required before any **Baby
Persona** (a minor's biometric likeness) can be created on mobile.

The backend was also reviewed on 2026-06-12 and found to carry **8 real bugs** on
shared services (hard-delete, Character→Persona promotion, book recovery,
candidate selection, persona-create failure, page recovery, text moderation,
store batching). The native app exercises those exact paths, so each bug is fixed
inside the slice that touches its service.

## Solution

Ship a **native Expo / React Native iOS app** as a new front-end over the same
Supabase project, domain services, Inngest workflows, and generation pipeline —
**zero duplicated domain logic**. The Next.js app stays as the **backend + web
surface**.

The money model is deliberately simple (optimized for fastest, simplest
revenue): a parent describes their baby through the **Trait Questionnaire** to
get a **Character** and generate **free, text-only Stories** (the acquisition
hook — no photos, no consent gate, no cost). An active **Subscription** (single
`active` entitlement; monthly + annual; **no trial** because the free text tier
*is* the trial) unlocks **everything else**: adding photos to promote a Character
into a **Baby Persona** (gated behind **Email-Plus VPC**), illustrated
**Storybooks**, multi-Persona Scenes, **Personalized Classics**, **Share links**,
and **Export**. The **gate line is illustration + Personas; text is always free.**

iOS billing is **Apple IAP via RevenueCat**, whose webhook drives the same
`active`/`inactive` Subscription state the Stripe webhook already drives on web.
Parental consent on iOS is **Email-Plus VPC**, fully decoupled from billing.

The work is delivered as **money-first vertical tracer-bullet slices** (matching
the existing issues 01–22 method), each independently buildable and testable, the
first reaching **TestFlight** at the free-text path and the App Store submission
after the first paid (Baby Persona illustrated) slice.

## Locked Decisions (from the grill)

1. **Shape:** dependency-ordered vertical tracer-bullet slices, not one monolith.
2. **Web code-review bugs:** each of the 8 fixed inside the native slice that
   touches its service (mapping in *Implementation Decisions → Bug fold-in*).
3. **Repo layout:** Next.js stays at repo root, untouched. Add an Expo app under
   **`/mobile`**. Share **types only** from `src/domain/types.ts` via a tsconfig
   path alias (`@domain/*`) + Metro `watchFolders` — types are compile-time only,
   so Metro never bundles backend code; **zero runtime coupling**, no risk to the
   green web build. No npm-workspaces restructure, no separate repo.
4. **Platform:** **iOS only** this effort; keep code cross-platform-clean (no
   iOS-only hacks) so a later Android pass is cheap. No Play billing / FCM now.
5. **Paywall:** one RevenueCat entitlement `active`; two packages — **monthly**
   and discounted **annual**; **no free trial**. Exact prices are set by the
   operator in App Store Connect; RevenueCat fetches them into the paywall.
6. **Free vs paid gate line:** free = a **Character** (Trait Questionnaire,
   photo-free) → **text-only Stories**. Subscribe + add photos + complete
   **Email-Plus VPC** → promote the Character into a **Baby Persona** → unlocks
   **illustration + everything else**. Text from a Character is always free.
7. **First paid release** includes the core pitch: **Baby Persona** illustrated
   Storybooks (via the Character→Persona upgrade path).
8. **Email-Plus VPC mechanics:** Guardian enters email + attests guardianship →
   backend emails a version-stamped consent link → Guardian opens it, sees what
   is collected (baby photos → biometric LoRA), confirms → Family flagged
   `consent_verified` with a version-stamped **Consent receipt**. The **"plus"**
   is a **delayed second confirmation email with a revoke link**. New
   `ConsentMethod` value `email_plus`; gates Baby Persona per-Jurisdiction config.
9. **Web surface untouched:** keeps Stripe-payment-as-VPC as the legacy web
   method; `email_plus` is added to the **shared** consent engine and used by
   mobile only. No changes to web flows.
10. **Live generation progress:** native reuses the web pattern — poll the
    existing `GET /api/storybooks/[id]` status endpoint (now Bearer-authed).
    Supabase realtime is a deferred enhancement, not in scope.
11. **Auth:** Supabase **email/password** (mirrors web) **+ Sign in with Apple**
    (`expo-apple-authentication` + Supabase Apple provider).

## User Stories

### Backend: Bearer-authenticated API (enabler for everything native)

1. As the native app, I want to authenticate every server call with the Supabase
   JWT as a **Bearer token**, so that I can reach the same domain services the web
   app uses without cookies/server-actions.
2. As the platform, I want Bearer routes to **verify the Supabase JWT** against
   the project JWKS and resolve the Member from the `sub` claim, so that identity
   is proven the same way as the web session.
3. As the platform, I want Bearer-authenticated mutations to reuse
   `createRequestContext()` and the existing services **unchanged**, so that no
   domain logic is forked or duplicated.
4. As the platform, I want every Bearer route to resolve **one Member within one
   Family** and never cross Families, so that per-Family RLS stays the isolation
   boundary.
5. As the native app, I want simple user-scoped **reads** to be allowed directly
   against Supabase under RLS, so that I avoid an unnecessary backend hop for
   cheap data while heavy/mutating/workflow calls go through the Next.js API.

### Slice 1 — Native scaffold + auth (→ first TestFlight build)

6. As a parent, I want to install the app and **sign up / sign in** with email and
   password, so that I can start using it on my phone.
7. As a parent, I want to **Sign in with Apple**, so that I can onboard with one
   tap and without sharing my email.
8. As a parent, on first sign-in I want a **Family** created with me as its first
   **Member (Guardian)**, so that I own my data exactly as on web.
9. As a parent, I want my session stored securely (tokens in the iOS keychain),
   so that I stay logged in safely across launches.
10. As a brand-new parent, I want a warm **cold-start** empty state pointing me to
    my first free text Story, so that I reach value fast.

### Slice 2 — Free Character tier (the acquisition hook)

11. As a parent, I want to create a **Character** by answering a short **Trait
    Questionnaire** (name, nickname, relationships, favorite animals/toys, songs,
    topics), so that I can star my baby/family with **no photos**.
12. As a privacy-conscious parent, I want to create a **fully fictional**
    Character with no real-child data, so that I can try the app with zero
    biometric exposure.
13. As a parent entering a **real child's** traits, I want a recorded notice +
    single guardian **light attestation** (per Jurisdiction config), so that the
    free tier stays lawful yet near-frictionless (ADR-0016).
14. As a parent, I want to generate a **text-only Story** from my Character for
    **free**, choosing a **Story Type** (Bedtime or Learning), so that I get a
    real keepsake at zero cost.
15. As a parent, I want a lovely native **reading view** for my text Story, so
    that the free experience already feels premium.

### Slice 3 — Subscription / paywall (turn money on)

16. As a parent, I want a **paywall** showing a monthly and an annual option with
    the **required auto-renew disclosure** (full price, period, how to cancel),
    so that I can subscribe in-app via Apple IAP.
17. As a parent, I want my purchase to **immediately unlock** paid features, so
    that I don't wait on a server round-trip after paying.
18. As a returning parent, I want to **restore purchases**, so that a reinstall or
    new device keeps my subscription.
19. As a parent, I want to **manage/cancel** my subscription from inside the app
    (Apple's manage-subscriptions sheet), so that I stay in control.
20. As the platform, I want a verified **RevenueCat webhook** to activate/cancel
    the Family's Subscription via the same `SubscriptionService` the Stripe
    webhook drives, so that web and iOS reach the same `active` state.
21. As a parent, I want illustrated generation and Persona creation **blocked
    unless my Subscription is active**, so that the paid boundary is consistent
    (ADR-0009); text Stories remain free regardless.

### Slice 4 — Email-Plus VPC + Baby Persona (first paid value, core pitch)

22. As a Guardian, I want to start **Email-Plus parental consent** by entering my
    email and attesting I am the guardian, so that I can later create a Baby
    Persona of my child.
23. As a Guardian, I want a consent email with a **version-stamped** link that, on
    open, shows exactly **what is collected** (baby photos → biometric LoRA) and
    why, so that my consent is informed.
24. As a Guardian, I want confirming that link to flag my Family
    `consent_verified` with a stored **Consent receipt**, so that consent is
    provable and tied to a notice version.
25. As a Guardian, I want a **delayed second confirmation email with a revoke
    link**, so that the "plus" step gives me a chance to dispute a consent I
    didn't make.
26. As a Guardian in a stricter **Jurisdiction**, I want `email_plus` required
    where my market's config demands it, so that the gate adapts without code
    changes (ADR-0015).
27. As a parent who started free, I want to **promote my Character into a Baby
    Persona** by adding photos via the native camera/library — gated on an active
    Subscription **and** completed Email-Plus VPC — so that I upgrade without
    re-entering anything (ADR-0016).
28. As a parent, I want the uploaded baby photos sent through the **same
    moderation-first pipeline** (moderate bytes before any persist; CSAM escalates
    to HITL/NCMEC) as the web upload path, so that safety is identical (ADR-0010).
29. As a parent, I want a **likeness-confirmation** review of my freshly trained
    Baby Persona before investing in a full book, so that I can accept or
    re-train.
30. As a parent, I want to generate an **illustrated Storybook** starring my Baby
    Persona, with **live progress** as Pages stream in, so that I get the core
    keepsake.

### Slice 5 — Curation + library + reader (illustrated)

31. As a parent, I want a failed/quarantined Page shown as a **re-rollable hole**
    I can retry **for free**, so that I'm never charged for the system's fault
    (free recovery vs paid re-roll, ADR-0004).
32. As a parent, I want to pick among Page **candidates** and re-roll text or
    illustration independently within my **re-roll budget**, so that I curate the
    book to taste.
33. As a parent, I want to **finalize** a draft once I'm happy, so that it becomes
    shareable/exportable.
34. As a parent, I want a **library shelf** of my Storybooks and an immersive
    native **page-turn reader**, so that reading feels like a real book.
35. As a parent, I want **offline** access to my finalized Storybooks, so that I
    can read at bedtime without a connection.

### Slice 6 — Adult / multi-Persona + Brief composer

36. As a Member, I want to create my own **Adult Persona** via native **selfie +
    liveness**, so that I can co-star without the Guardian/VPC gate (it's my own
    likeness).
37. As a parent, I want a **Brief composer** (starring Personas, Story Type,
    theme, setting, optional moderated note) feeding the existing pipeline, so
    that I can direct the story.
38. As a parent generating a **multi-Persona** Page (baby + grandparent), I want
    the existing sequential-inpaint / ref-model path used behind its gate, so that
    they appear together coherently (ADR-0005).

### Slice 7 — Personalized Classics + sharing + export

39. As a parent, I want to pick a **Personalized Classic** from the curated
    public-domain catalog and have my Personas recast into it, so that my child
    hears a familiar tale starring their own family (ADR-0017).
40. As a parent, I want to mint and revoke a non-indexed **Share link** (optional
    expiry/passcode) with a likeness warning, via the native share sheet, so that
    I can share a finalized book outside the Family, revocably (ADR-0013).
41. As a parent, I want to **Export** a finalized Storybook as a PDF and share it
    via the native share sheet, so that the keepsake survives cancellation.

### Slice 8 — Push + account + in-app hard-delete

42. As a parent, I want **native push** ("Persona ready" / "Storybook ready"), so
    that I'm told when async work finishes without watching the app.
43. As the platform, I want device tokens stored in a `push_subscriptions` store
    and sent via the Expo push service, so that notifications are delivered
    reliably and removed on hard-delete.
44. As a parent, I want to **delete my account / hard-delete my Family entirely
    in-app** (no web redirect), so that the App Store deletion requirement is met
    and my child's data is provably erased across Postgres, blobs, **and push
    tokens** (ADR-0007).
45. As a parent, I want an account screen showing Members, Jurisdiction notice,
    and subscription status, so that I can manage my Family.

### Slice 9 — App Store readiness + EAS + handoff

46. As the operator, I want **EAS build/submit** profiles, the **AASA** file
    hosted, permission usage strings, and the paywall disclosure all in code, so
    that the app is submittable to TestFlight/App Store.
47. As the operator, I want a precise **`INTEGRATION-FOR-OPUS.md`** runbook for the
    account/credential/signing/submission steps that only a human can do, so that
    Opus can walk me through Apple/RevenueCat click-by-click.

## Implementation Decisions

### Repo & type sharing
- Next.js app stays at repo root (backend + web), untouched. New **`/mobile`**
  Expo app (Expo Router, TypeScript). `mobile/tsconfig.json` adds `@domain/*` →
  `../src/domain/*`; `mobile/metro.config.js` adds `watchFolders` for
  `../src/domain`. Mobile imports **types only** from there — never runtime
  backend modules.

### Backend: Bearer-auth API (Slice 0/1)
- Add a `requireBearerMember(request)` helper that extracts the `Authorization:
  Bearer <jwt>`, verifies it with `jose` `createRemoteJWKSet` + `jwtVerify`
  against `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, resolves the
  Member from the `sub` claim, and returns a **`RequestContext` identical to the
  cookie path** (reuse `createRequestContext()`). This is the single new auth
  seam; everything else reuses existing services.
- Add **API route handlers** under `src/app/api/...` mirroring every mutating
  server action in `src/lib/actions.ts` that the native app needs — **grown
  per-slice**, not all at once. Each route authenticates via
  `requireBearerMember`, calls the existing service, returns JSON. Reads that are
  cheap and user-scoped may go directly to Supabase under RLS from the app.
- RLS is **not weakened**; Bearer routes resolve exactly one Member/Family.

### Subscription / RevenueCat (Slice 3)
- Mobile uses `react-native-purchases` (RevenueCat): fetch offerings, purchase a
  package, read the `active` entitlement, gate the UI on it; **never** render
  Stripe checkout in-app.
- Add a **RevenueCat webhook** route (`src/app/api/webhooks/revenuecat`) that
  verifies the signature and calls `SubscriptionService.activate/cancel` for the
  Family — the same state the Stripe webhook drives. A single `active`/`inactive`
  state; one entitlement.
- The illustrated-generation / Persona-creation **gate stays exactly as today**;
  only the payment rail differs. Text generation is never gated.

### Email-Plus VPC (Slice 4)
- Extend the `ConsentMethod` union with **`email_plus`** and add it as a
  configurable per-Jurisdiction method in the consent-engine config table
  (`ConsentEngine` already branches on `consentMethod`).
- New **VPC state-machine service** with states `requested → link_sent →
  confirmed (+ receipt) → revocable`, plus a delayed `second_confirmation_sent`
  step. It uses the existing `NotificationAdapter` (Resend) to send the consent
  link and the delayed confirmation/revoke email. On confirm it writes a
  **version-stamped Consent receipt** (reuse the receipt model) and flags the
  Family `consent_verified`.
- **Baby Persona creation** requires (a) an active Subscription **and** (b)
  completed `email_plus` consent where the Jurisdiction config requires it.
- Adult Persona unchanged (self + liveness); Character light attestation
  unchanged.

### Character → Baby Persona promotion (Slice 4)
- Reuse the existing promotion path. Photos captured via `expo-image-picker` /
  `expo-camera`, uploaded to the blob store via a **Bearer-authed upload route**,
  then the existing `persona-create` Inngest flow runs. The upload route sends
  **bytes through the same moderation-first pipeline** before any persist; CSAM
  escalates to HITL/NCMEC (ADR-0010) — no new moderation logic.

### Push (Slice 8)
- Implement the existing `PushSubscriptionStore` port over a new
  `push_subscriptions` table; register the device token after login via
  `expo-notifications`; backend sends via `expo-server-sdk` (Expo push), wired to
  the existing "Persona ready" / "Storybook ready" notification points.
- **Hard-delete** must also clear `push_subscriptions` for the Family.

### Offline reading (Slice 5)
- On first open of a finalized Storybook, cache its Page text + illustration bytes
  locally via `expo-file-system`, keyed by book id; the reader prefers the local
  cache. No new server contract.

### App Store in-code requirements (Slice 9)
- Paywall auto-renew disclosure (price/period/cancel) pulled from
  RevenueCat/StoreKit product data; in-app account deletion wired to the existing
  hard-delete; Info.plist permission usage strings (camera, photo library, push)
  via `app.config.ts`; native camera/push/navigation/offline satisfy Guideline
  4.2. Category **Books/Education, 4+ / parents — not the Kids Category.**
- `mobile/app.json`/`app.config.ts`, `mobile/eas.json` (development/preview/
  production + `submit.production` placeholders), AASA hosted at
  `public/.well-known/apple-app-site-association`, `mobile/.env.example` +
  additions to root `.env.example`. **No secrets committed.**

### Bug fold-in (each fixed inside the slice that touches its service)
- **Slice 1 (auth/context):** none directly, but establishes the Bearer path the
  others ride.
- **Slice 2 (text/Character):** *text moderation bypass on non-numeric class
  score* (`moderation.ts`) — fail closed; *`sync()` per-step round-trip batching*
  (touched broadly, fix when the store is first exercised hard).
- **Slice 3 (subscription):** none specific.
- **Slice 4 (persona promotion + workflow):** *baby Character→Persona promotion
  hardcodes `kind:"adult"`* (`workflows/functions.ts`; thread `kind` through
  `PersonaCreatePayload`/promote action) — **the native app hits this on its core
  paid path**; *failed persona-create strands the Persona in `training`* (flip
  status in the workflow catch).
- **Slice 5 (curation/recovery):** *`finalizeStorybookStatus` can't un-fail a
  recovered book* (early-returns unless `generating`); *`selectCandidate` writes
  `illustrationUrl` not `illustrationBlobKey`* (readers/export key off the blob
  key); *`pageRecover` has no terminal-failure handler*.
- **Slice 8 (account/hard-delete):** *`hardDeleteFamily` misses `textStories`,
  `pendingBriefs`, `moderationAudit`* and `SupabaseDataStore.sync()` re-upserts
  them — extend hard-delete to clear those **and** `push_subscriptions`.

## Testing Decisions

- **Test external behavior at the service/route seam, with provider adapters
  faked** — the established project pattern. Do **not** test RevenueCat/Apple/
  Supabase/Expo SDK internals, nor React Native render details.
- **Bearer auth:** drive `requireBearerMember` with a **faked JWT verifier**;
  assert a valid token resolves the right Member and yields a `RequestContext`
  equivalent to the cookie path; assert an invalid/missing/foreign token is
  rejected and **never** crosses Families (extends the RLS isolation test in
  `01-walking-skeleton`).
- **RevenueCat webhook:** post a faked signed payload to the webhook route; assert
  `SubscriptionService` flips the Family to `active`/`inactive`; assert a bad
  signature is rejected. Mirror the Stripe-webhook/`02-subscription-consent` test.
- **Email-Plus VPC:** drive the VPC service with a **faked Resend adapter**;
  assert the state machine `requested → confirmed` writes a version-stamped
  Consent receipt and flags `consent_verified`; assert Baby Persona creation is
  **blocked** until consent is confirmed where the (faked) Jurisdiction config
  requires `email_plus`, and **allowed** once confirmed; assert the delayed
  confirmation/revoke email is sent. Prior art: `02-subscription-consent`,
  `03-adult-persona` (consent/liveness shape).
- **Subscription gate:** assert illustrated generation + Persona creation are
  rejected when inactive, accepted when `active`; assert **text generation is
  never gated** by subscription.
- **Promotion bug:** assert promoting a **baby** Character through the
  **workflow** yields a Baby Persona (not `adult`) — the test that currently
  passes only because it bypasses the workflow must now go through it.
- **Push store:** assert tokens register/dedupe and that hard-delete removes a
  Family's `push_subscriptions` (faked store).
- **Hard-delete propagation:** extend the cross-store delete test
  (`12-hard-delete`) to assert `textStories`, `pendingBriefs`, `moderationAudit`,
  and `push_subscriptions` are erased and **not re-upserted** by `sync()`.
- **Recovery / curation bugs:** assert a `failed` book can be recovered to
  `draft`; assert a selected re-roll candidate is read back via
  `illustrationBlobKey` and respects moderation.
- **Integration (real-ish):** RLS Family-isolation on Bearer routes; hard-delete
  across Postgres + R2 blobs + push tokens.
- The **mobile UI** is validated by building and running in the iOS simulator and
  by exercising the Bearer API it calls — not by snapshot/render-detail tests.

## Out of Scope

- **Android** (this pass is iOS-only; keep code cross-platform-clean).
- **Supabase realtime** for generation progress (polling the existing status
  endpoint is the v1 mechanism).
- **Changing the web surface** — web keeps Stripe billing and Stripe-payment-as-VPC
  as its legacy consent method; only the **shared** consent engine gains
  `email_plus`.
- **Real Persona LoRA training** productionization, **Audio/Video** mediums, and
  **multi-tier** subscriptions (single `active` entitlement only) — unchanged from
  prior PRDs.
- **The human account/credential/signing/submission work** — Apple Developer
  enrollment, `.p8` keys, RevenueCat dashboard, subscription products, screenshots,
  App Privacy answers, pressing Submit. These are captured in
  `INTEGRATION-FOR-OPUS.md` for Opus to walk the human through; Cursor writes all
  the **code/config** that consumes them and references every secret as a
  documented env var / placeholder.
- **In-app trial logic** (no IAP free trial; the free text tier is the trial).

## Further Notes

- The original `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md` is the all-in-one
  reference for tone/standard and the full screen inventory (§4) and credential
  table (§7); this PRD decomposes it into the slices below for Cursor and pins the
  decisions the grill resolved.
- **Slice order is money-first:** Slice 1 reaches a TestFlight-able build; Slice 3
  turns billing on; Slice 4 delivers the first paid value (Baby Persona
  illustrated Storybook) and is the **App Store submission point**. Later slices
  deepen the experience.
- Per-market **legal sign-off** of the `email_plus` flow and the public-domain
  **catalog sourcing** for Classics are content/legal dependencies tracked
  separately, not code — they gate *shipping* those slices, not building them.
- Cursor should build each slice **TDD** (red → green), keep the **105 web tests
  green** throughout, and run `npx tsc --noEmit` + lint for both root and
  `mobile/` before declaring a slice done.
