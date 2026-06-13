# FABLE ONE-SHOT — Build Lullabook as a native iOS app, TestFlight- and App Store-ready

> **You are Claude Fable 5, working autonomously in a fresh session.** This is a
> single, large, do-it-all-in-one-go build prompt. Read it fully before you touch
> a file. The web app already exists and works (105 tests green); your job is to
> add a **native iOS front-end** and the backend changes it needs, take it all the
> way to a build that can be uploaded to **TestFlight** and submitted to the **App
> Store**, and then stop at the precise boundary where a human (guided by Opus)
> must create accounts and click buttons on Apple's and RevenueCat's websites.
>
> Path to this prompt if you need to re-read it:
> `/Users/vraj/Desktop/Work/Lullabook/docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md`

---

## 0. Operating context — read these first, in order

1. `README.md` (repo root) — current architecture, run/deploy, known gaps.
2. `CONTEXT/CONTEXT.md` — the canonical glossary. Use this vocabulary everywhere
   (Family, Member, Guardian, Persona/Baby/Adult, Character, Storybook, Page,
   Brief, Style Bible, Scene, Share link, Jurisdiction, Hard-delete, VPC). Banned
   synonyms: "soft delete", "Parent Persona", "remix", "country" for jurisdiction.
3. `CONTEXT/docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md` — **the
   decisions that authorize this whole effort.** Do not relitigate them.
4. Skim ADRs 0003 (web-first, now amended), 0007 (hard-delete), 0008 (VPC, now
   amended), 0009 (subscription), 0010 (child safety), 0011 (backend), 0015
   (multi-jurisdiction), 0016 (Character two-tier consent).
5. `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-12.md` — the state the web app was
   left in, including its known gaps.
6. The existing web one-shot for tone/standard: `docs/FABLE-ONESHOT-PROMPT.md`.

**What already exists (reuse, do not rebuild):** Supabase Postgres + per-Family
RLS, the domain services in `src/services/`, the adapter ports in
`src/adapters/types.ts` with real implementations, the Inngest durable workflows,
the Anthropic/fal generation pipeline, Stripe, Resend email, the full web UI.
The native app is a **new front-end over the same backend** — it must not fork
the domain logic.

---

## 1. Phase 0 (MANDATORY FIRST STEP) — run `/grill-with-docs`

Before writing any code, invoke the **`/grill-with-docs`** skill and grill the
operator through every open detail this prompt does not fully pin down. At
minimum resolve: monorepo layout (recommended: keep the Next.js app at repo root
as backend+web, add the Expo app under `/mobile`), how much of the web UI maps
1:1 vs. is rethought for native, whether Android is in scope now (recommended:
**iOS only for this pass**, but keep code cross-platform-clean), and the exact
subscription products/prices. Record resolved terms in `CONTEXT/CONTEXT.md` and
any hard, surprising trade-offs as new ADRs. Ask questions one at a time with a
recommended answer. **Do not skip this step**; it is how you avoid building the
wrong thing for a week.

---

## 2. Mission

Deliver a **native Expo / React Native iOS app** for Lullabook that:

- reuses the existing Supabase project, domain services, Inngest workflows, and
  generation pipeline through a **token-authenticated API**, with **zero
  duplication** of domain logic;
- implements **every parent-facing flow** the web app has (auth, free Character +
  text Story, Persona creation with native camera, Character→Persona upgrade,
  Brief composer + live generation progress, Personalized Classics, draft
  curation, library + reader, sharing, export, billing, account, hard-delete,
  cold-start) in a warm, polished, accessible **native** UI;
- bills via **Apple In-App Purchase through RevenueCat** (never the Stripe web
  checkout inside the app);
- gates Baby Persona creation behind **Email-Plus verifiable parental consent**,
  decoupled from billing (ADR-0018);
- sends **native push** ("Persona ready" / "Storybook ready") via Expo push +
  APNs;
- satisfies every **App Store technical requirement** that lives in app code
  (paywall auto-renew disclosure, in-app account deletion, permission usage
  strings, native functionality for Guideline 4.2);
- builds with **EAS Build** and is configured for **EAS Submit** to
  TestFlight/App Store;
- keeps **all existing web tests green** and adds tests for new backend surfaces.

When the code is complete and the only thing left is human account/credential
work, you **stop and produce a precise integration handoff for Opus** (see §8).

---

## 3. The decided architecture — implement this, don't re-derive it

ADR-0018 already fixed the big choices. Concretely:

### 3.1 Repo shape
- Keep the existing Next.js app at repo root: it is the **backend + web surface**.
- Add the Expo app under **`/mobile`** (Expo SDK latest, **Expo Router**,
  TypeScript). Share domain types from `src/domain/types.ts` — import via a path
  alias or a tiny shared package; do not copy-paste and drift.

### 3.2 Auth (mobile)
- `@supabase/supabase-js` with **`expo-secure-store`** for session storage
  (hybrid: tokens in SecureStore, rest in AsyncStorage), `autoRefreshToken: true`,
  `persistSession: true`, **`detectSessionInUrl: false`**.
- Email/password sign-in/up; OAuth (Apple Sign In is effectively required by
  Apple if you offer any third-party social login — research and confirm) via
  `expo-auth-session` + deep links.
- Deep-link scheme `com.lullabook` and **Associated Domains** (`applinks:`) for
  auth callbacks and share links.

### 3.3 Backend reuse (the key backend workstream)
- The native app authenticates server calls with the **Supabase JWT as a Bearer
  token**. Today the backend authenticates via **cookies + server actions**, which
  the native app cannot use.
- **Add API route handlers** (`src/app/api/...`) that mirror every mutating server
  action in `src/lib/actions.ts`, but authenticate by **verifying the Supabase JWT**
  (via the project JWKS endpoint `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`,
  using `jose`'s `createRemoteJWKSet` + `jwtVerify`) and resolving the Member from
  the `sub` claim. Reuse `createRequestContext()` and the services unchanged.
- For simple, user-scoped **reads**, the app may call Supabase directly and rely on
  RLS. Heavy/mutating/workflow operations go through the Next.js API.
- Do **not** weaken RLS. Bearer-authenticated routes still resolve a single Member
  and operate within that Family.

### 3.4 Billing — Apple IAP via RevenueCat
- Mobile: `react-native-purchases` (RevenueCat). Fetch offerings, purchase a
  package, read entitlements. **Never** render the Stripe checkout in the app.
- Backend: add a **RevenueCat webhook** route that verifies the signature and
  activates/cancels the Family's Subscription via `SubscriptionService` — the same
  subscription state the Stripe webhook already drives. A Family subscribed on web
  (Stripe) or iOS (IAP) reaches the same `active` state.
- The subscription **gate** on illustrated generation stays exactly as today; only
  the payment rail differs.

### 3.5 Consent — Email-Plus VPC (decoupled from billing)
- Add a **verifiable parental consent flow** that does not depend on a payment:
  Guardian requests consent → backend sends a consent link via **Resend** → Guardian
  confirms → second confirmation → Family flagged `consent_verified` with a
  **version-stamped ConsentReceipt** (reuse the receipt model; add a new
  `ConsentMethod` value, e.g. `email_plus`).
- **Baby Persona creation is gated on this consent**, per jurisdiction config
  (ADR-0015/0008). The `ConsentEngine` already branches on `consentMethod`; extend
  it so `email_plus` is an accepted method and is required where configured. Adult
  Persona still uses self + liveness; Character tier still uses the light
  attestation (ADR-0016) — unchanged.

### 3.6 Push notifications
- `expo-notifications` + the **Expo push service**. Register the device token after
  login, store it in a new **`push_subscriptions`** table (the
  `PushSubscriptionStore` port already exists in `src/adapters/notifications.ts`;
  implement it). Backend sends via `expo-server-sdk`, replacing/augmenting the
  web-push path for "Persona ready" / "Storybook ready".

### 3.7 Native media + features (also clears Guideline 4.2)
- `expo-image-picker` (library) + `expo-camera` (selfie) for Persona photos and the
  adult selfie. Upload bytes to the existing blob store via a Bearer-authenticated
  upload route, then trigger the existing `persona-create` Inngest flow.
- Native navigation (Expo Router), native push, native camera, and offline reading
  of finalized Storybooks are the concrete "native value" that satisfies 4.2 — do
  not ship a thin web wrapper.

---

## 4. The native app surface — build every screen

Map the web surface to native (Expo Router stacks/tabs). Warm "bedtime" identity,
mobile-native (not a ported web layout), accessible (Dynamic Type, VoiceOver
labels, sufficient contrast), tasteful motion. Screens:

- **Onboarding & auth:** sign up (jurisdiction selection), sign in, Apple Sign In,
  create Family / become Guardian, invite Members.
- **Free Character tier:** Trait Questionnaire (fictional vs real-child branch,
  light attestation where required), then **text-only Story** generation with Story
  Type selection and a lovely native reading view.
- **Persona creation:** Adult (native selfie capture + liveness consent), Baby
  (**Guardian-only, requires Email-Plus VPC complete + active subscription**),
  training → ready → **likeness confirmation** review step.
- **Character → Persona upgrade** (attach photos via camera/library, carry traits).
- **Brief composer:** starring Personas, Story Type, theme, setting, note, curated
  art-style menu + optional moderated custom note → submit → **live generation
  progress** as Pages stream in, failed/quarantined Pages shown as re-rollable
  holes (poll the existing status endpoint or subscribe via Supabase realtime).
- **Personalized Classics:** curated public-domain picker → recast → same pipeline.
- **Curation:** per-Page candidate picker, independent text/illustration re-roll
  honoring the re-roll budget (free recovery vs paid re-roll), finalize.
- **Library + reader:** shelf of Storybooks; immersive native page-turn reader;
  **offline** access to finalized books.
- **Sharing:** create/revoke non-indexed Share links (expiry/passcode), likeness
  warning, native share sheet.
- **Export:** the finalized-book PDF (open/share via native share sheet).
- **Billing:** **RevenueCat paywall** with the **required auto-renew disclosure**
  (full price, period, trial if any, how to cancel), manage/cancel via
  `showManageSubscriptions`, restore purchases.
- **Account & privacy:** members, jurisdiction notice, **in-app Delete Account**
  (hard-delete) with confirmation — entirely in-app, no web redirect.
- **Consent:** the Email-Plus VPC flow surfaced at the point of Baby Persona
  creation.
- **Cold-start:** graceful empty states guiding a brand-new parent to first value
  (a free text Story) fast.

---

## 5. App Store requirements that live in app code (do these, they are gating)

- **Paywall disclosure (3.1.2):** show full renewal price, period, trial length,
  and "cancel in Settings" text, pulled from StoreKit/RevenueCat product data.
- **In-app account deletion (5.1.1(v)):** wire the existing hard-delete to a native
  Settings → Delete Account flow; no browser hand-off.
- **Permission usage strings (Info.plist via app config):**
  `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSPhotoLibraryAddUsageDescription`, push permission rationale — all written to
  honestly describe taking child photos for storybook generation.
- **Guideline 4.2:** real native camera/push/navigation/offline (covered in §3.7).
- **Category:** target **Books** (or Education), audience **4+ / parents — NOT the
  Kids Category** (research confirms Kids Category would forbid your analytics/
  backend SDKs and add gating; the app is parent-facing). Do not use "for kids" in
  name/keywords.
- **Privacy strings & data map:** prepare the data the operator will need for the
  App Privacy nutrition label (photos collected, linked to identity, retention,
  deletion) — write it into the integration handoff (§8), since the operator enters
  it on App Store Connect.

---

## 6. EAS / build configuration (you write these; you cannot run the signed build)

- `mobile/app.json` (or `app.config.ts`): `name`, `slug`, `ios.bundleIdentifier`
  (recommend `com.lullabook.app`), `ios.buildNumber`, `version`, icons, splash,
  `scheme: "com.lullabook"`, `ios.associatedDomains`, the permission plugin configs
  for camera/image-picker/notifications, and the `extra.eas.projectId` placeholder.
- `mobile/eas.json`: `development`, `preview`, and `production` build profiles, and
  a `submit.production` block with placeholders for `appleId`, `ascAppId`,
  `appleTeamId`. Leave secrets as clearly-marked placeholders.
- Host the **`apple-app-site-association`** file at
  `public/.well-known/apple-app-site-association` on the web app (Team ID +
  bundle ID + paths for `/auth/callback`, `/share/*`). Note the Team ID is a
  placeholder until the operator provides it.
- Document, in the README and the integration handoff, the exact commands:
  `eas login`, `eas build:configure`, `eas build --platform ios --profile production`,
  `eas submit --platform ios`, and the sandbox/TestFlight IAP testing steps.

---

## 7. Research directives — what to look up, and the credentials to find (and where)

You have a research budget. When a detail below is stale or unclear, **research it
against official docs** (`docs.expo.dev`, `developer.apple.com`,
`supabase.com/docs`, `docs.revenuecat.com`, FTC COPPA guidance) before
implementing — do not guess SDK surfaces or Apple rules. A prior research pass
already gathered the essentials; treat the credential list below as the source of
truth for **what the human must obtain**, and verify exact dashboard paths live if
they've moved.

**You cannot create accounts, enroll in programs, generate signing keys, or click
through Apple/RevenueCat dashboards.** For every credential below, your job is to:
(a) write the code/config that *consumes* it, (b) reference it by a clearly-named
environment variable or placeholder, and (c) list it in the integration handoff
(§8) with the exact page the human fetches it from. Never invent real secret
values; never commit secrets.

### Credentials & accounts the human (via Opus) must provide
| Credential / account | Where it comes from | Consumed by |
|---|---|---|
| **Apple Developer Program** ($99/yr) enrollment | developer.apple.com/programs | everything iOS |
| **Apple Team ID** | developer.apple.com/account → Membership | AASA file, eas.json |
| **App Store Connect app record** + numeric **App ID (ascAppId)** | appstoreconnect.apple.com → Apps → + | eas.json submit, RevenueCat |
| **Bundle Identifier** (`com.lullabook.app`) | App Store Connect / Certificates, IDs & Profiles | app.json, signing |
| **App Store Connect API Key** (`.p8` + Issuer ID + Key ID) | App Store Connect → Users and Access → Integrations → App Store Connect API | EAS Submit, RevenueCat |
| **In-App Purchase Key** (`.p8`) | App Store Connect → Users and Access → Integrations → In-App Purchase | RevenueCat receipt validation |
| **APNs Auth Key** (`.p8` + Key ID) | developer.apple.com → Certificates, IDs & Profiles → Keys | EAS push credentials / Expo |
| **iOS Distribution cert + provisioning profile** | auto-managed by `eas credentials` (preferred) | signed build |
| **RevenueCat account + project + public SDK API key + webhook secret** | app.revenuecat.com | mobile IAP + backend webhook |
| **Subscription products** (group, product IDs, prices, trial) | App Store Connect → Monetization → Subscriptions | RevenueCat offerings, paywall |
| **EAS / Expo account + access token** | expo.dev (`eas login`) | EAS build/submit, push |
| **Supabase project URL + publishable (anon) key** | Supabase dashboard → Settings → API | mobile supabase client |
| **Privacy Policy URL + Support URL** | the operator hosts these | App Store listing |
| **Screenshots, app icon (1024²), description, keywords, demo account** | the operator creates | App Store listing |

Put `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_API_BASE_URL`, and any others into a
`mobile/.env.example`, mirroring how the web app's `.env.example` is organized.
Add the new backend secrets (`REVENUECAT_WEBHOOK_SECRET`, `EXPO_ACCESS_TOKEN`,
`SUPABASE_JWT_*` if needed) to the root `.env.example`.

---

## 8. The hand-off boundary — when code is ready, STOP and brief Opus

You can take this to a **buildable, simulator-runnable, test-green** state, but you
**cannot** enroll the Apple account, generate `.p8` keys, configure the RevenueCat
dashboard, create subscription products, upload screenshots, or press Submit. When
the code is complete:

1. Write **`CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md`** — a precise, ordered,
   click-by-click runbook for the human, that Opus (the user's next model) will
   walk them through live. It must cover, in order: Apple Developer enrollment →
   bundle ID + App Store Connect record → API/IAP/APNs keys (exact pages) →
   `eas login` + `eas build:configure` → first `eas build` → `eas submit` to
   TestFlight → create subscription products → wire RevenueCat (upload `.p8`s,
   offerings, webhook) → sandbox IAP test on TestFlight → App Privacy answers →
   screenshots/description/privacy-policy → submit for review. For each step name
   the exact website page, the credential produced, and where it gets pasted
   (which env var / config field).
2. Write **`mobile/README.md`**: how to run the app in the simulator
   (`npx expo run:ios` / Expo Go limits), env setup, and the EAS commands.
3. Run `/handoff` and `/push-handoff` so the branch + docs land on GitHub.
4. End your final message with: a summary of what you built, every `DECISION:` you
   made, the green-test/build state, and a one-line pointer to
   `INTEGRATION-FOR-OPUS.md` as the human's next step.

Explicitly tell the user, in that final message, that **Opus will now take over to
guide the account/signing/submission steps** — that is the intended division of
labor (Fable writes all the code; Opus walks the human through Apple).

---

## 9. Hard constraints (non-negotiable)

1. **Keep all existing web tests passing** (currently 105). Add tests for every new
   backend surface (Bearer-auth API routes, JWT verification, RevenueCat webhook →
   subscription activation, Email-Plus VPC state machine, push-subscription store).
   Test at the service/route seam with fakes; don't test vendor SDK internals.
2. **No duplicated domain logic.** The native app calls the same services through
   the API; it does not reimplement generation, consent, budgets, or RLS.
3. **Per-Family RLS remains the isolation boundary** — Bearer routes resolve one
   Member and never cross Families.
4. **Never ship Stripe web checkout inside the iOS app.** iOS billing is Apple IAP
   only (3.1.1); no steering to external payment for digital goods.
5. **Baby Persona requires completed Email-Plus VPC** (version-stamped receipt),
   per jurisdiction config — independent of the IAP subscription. Adult Persona =
   self + liveness; real-child Character = light attestation; fictional Character =
   none. All driven by configurable per-jurisdiction rules, never hardcoded.
6. **Moderation before persist; CSAM escalates to HITL/NCMEC** — unchanged; the
   native upload path must still send bytes through the same moderation-first
   pipeline before any blob is stored.
7. **Deterministic, replay-safe workflow keys** — unchanged; no new `uuid()`/
   `Date.now()` inside durable bodies.
8. **Re-roll cost split** (system recovery free; parent re-roll spends budget),
   **`failed` floor**, **subscription gate**, **hard-delete erases Postgres + blobs
   + (now) push tokens** — all preserved.
9. **In-app account deletion and paywall auto-renew disclosure are present** (App
   Store gating).
10. **No secrets committed**; every secret is a documented env var / placeholder.
11. **Do not break the web app.** It stays the backend and the web surface; its
    behavior is the spec for the shared services.

> Note for whoever runs this: the web build had a code review on 2026-06-12 listing
> real bugs (baby Character→Persona promotion via the workflow hardcodes `adult`;
> `hardDeleteFamily` misses `textStories`/`pendingBriefs`/`moderationAudit`;
> `finalizeStorybookStatus` can't un-fail a recovered book; `selectCandidate`
> writes `illustrationUrl` not `illustrationBlobKey`). Fix these as you touch the
> shared services, since the native app exercises the same paths — see the review
> in the 2026-06-12 session notes.

---

## 10. How to work

- **Run `/grill-with-docs` first** (§1). Then build in this order: (1) backend
  Bearer-auth API routes mirroring the actions + JWT verification + tests; (2)
  RevenueCat webhook → subscription + tests; (3) Email-Plus VPC backend + consent
  engine extension + tests; (4) push-subscription store + Expo push backend; (5)
  the Expo app scaffold (Expo Router, supabase client, auth); (6) every screen in
  §4; (7) RevenueCat paywall + IAP; (8) native camera/upload; (9) App Store
  in-code requirements (§5); (10) EAS config + AASA + `.env.example`s; (11) the
  integration handoff for Opus (§8).
- **Make decisions.** Where this prompt leaves a detail open, pick the strongest
  reasonable option, implement it fully, and leave a short `// DECISION:` note. Do
  not stall waiting for the user except in the `/grill-with-docs` phase.
- **Write complete files.** No TODOs, no truncation, no "rest unchanged."
- **Match existing style** and the glossary. New code reads like the code already
  there.
- **Verify before you claim done:** web `npm test` green; new backend tests green;
  `npx tsc --noEmit` and `npm run lint` clean for the web app; `mobile/` typechecks
  and lints; the Expo app runs in the iOS simulator; `eas build --platform ios`
  is configured (even if the human must run the signed build).

## 11. Self-verify checklist (walk it before reporting done)
- [ ] `/grill-with-docs` was run and open questions resolved + recorded.
- [ ] All existing web tests still pass; new backend surfaces are tested.
- [ ] Native app implements every flow in §4 and runs in the simulator.
- [ ] iOS billing is IAP-via-RevenueCat only; no Stripe checkout in the app.
- [ ] Baby Persona is gated on Email-Plus VPC; consent receipt is version-stamped.
- [ ] Bearer-auth API routes verify the Supabase JWT and respect RLS/one-Member.
- [ ] Push works end-to-end through the new push-subscription store.
- [ ] In-app account deletion + paywall disclosure + permission strings present.
- [ ] EAS build/submit configured; AASA hosted; `.env.example`s complete; no
      secrets committed.
- [ ] `CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md` + `mobile/README.md` written.
- [ ] `/handoff` + `/push-handoff` run; final message points the user to Opus for
      the account/signing/submission walkthrough.

## 12. Output
Produce all file changes as complete files, organized backend → mobile-scaffold →
screens → billing/consent/push → EAS config → docs/tests. End with: a concise
summary of what you built, every `DECISION:`, the verification state, and the
explicit hand-off line telling the user that **Opus will now guide the manual Apple
/ RevenueCat / App Store Connect integration** using `INTEGRATION-FOR-OPUS.md`.

Now begin by reading `CONTEXT/` and `README.md` as instructed, then run
`/grill-with-docs`, then build.

---

## Operator notes (NOT part of the prompt — for the human / for Opus)
- This prompt is the native-iOS counterpart to `docs/FABLE-ONESHOT-PROMPT.md`
  (which productionized the web app). Run it in a fresh high-effort Fable session,
  or hand to Cursor if you prefer — it is self-contained.
- The division of labor is deliberate: **Fable writes 100% of the code and
  config; it cannot create your Apple/RevenueCat/Expo accounts or run the signed
  build.** When it finishes, open `CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md` and
  have Opus walk you through it click-by-click.
- The single biggest compliance subtlety, already decided in ADR-0018: on iOS,
  **Apple IAP handles money, Email-Plus handles parental consent** — they are
  separate, because Apple IAP cannot prove who the parent is.
