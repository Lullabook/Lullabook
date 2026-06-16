# PRD v9 — Native Mobile Feature Wave (make the app real: Journal + Storybook on device)

Status: **ready-for-agent** (grilled 2026-06-16). Builds on PRD v5 "Maya's World,"
PRD v6 "Journal & Moments," PRD v8 "Photo Stories/Firsts/Birthday," and ADR-0018
(native Expo front-end over the existing Bearer-authenticated backend).

Domain language: `CONTEXT/CONTEXT.md` — "Native mobile feature wave — incoming
language (PRD v9)" (Mobile parity backbone, Mobile Journal, Mobile Storybook).
Decision spine touched: **none new** — this wave reuses existing services and ADRs.
ADR-0009 carries a 2026-06-16 deferral note (payment is a separate `/part1`).

> This is a **mobile-only, features-first** wave. The Expo app in `mobile/` is
> currently a beautiful shell: most submit handlers are TODO-stubbed and the feature
> set lags the web. This PRD makes the simulator app **actually function** end-to-end
> and brings two feature areas the product owner wants to exercise on device —
> **Journal/Moments/Firsts** and **Storybook generation + reader** — over the real
> Bearer API. The web stays the backend (ADR-0018); we wire, we don't rewrite.

## 1. Vision

The product owner is iterating on the native app in the iOS Simulator. Right now they
can sign in and see themed screens, but the **Daily** screen's moments are local mock
state (`TODO: persist via createDayMoment API`), `characters/[id]` never fetches the
character it edits, `family/new` and `account` actions are stubbed, and there is **no
way to generate or read an illustrated Storybook on the device at all**. This wave
closes that gap: a parent can log a real Moment, see their Baby's Journal timeline and
Firsts, take the inline "make this a Story" offer, generate an illustrated Storybook,
and read it page by page — all native, all over the existing domain services.

## 2. The model (what's new)

| Term | Meaning |
|---|---|
| **Mobile parity backbone** | Wiring every stubbed mobile submit handler to the existing **Bearer API** (`mobile/lib/api.ts` → `src/app/api/*`), plus the **missing API routes** the features need: Moments **create/list**, Storybook **create/generate** + **list**. No new backend — the domain services (`moment.ts`, `journal-nudge.ts`, `storybook.ts`, `world.ts`) already exist; this exposes them to the native client. |
| **Mobile Journal** | The [Journal](../CONTEXT.md)/[Moment](../CONTEXT.md)/[Firsts](../CONTEXT.md) loop on device, over real data: log a Moment, see the per-Baby timeline, filter Firsts, take the inline offer. Same suggestion contract as web (offer → confirm Story Type → generate; **never silent**). Tier-agnostic / free. |
| **Mobile Storybook** | Native [Storybook](../CONTEXT.md) generation (Brief → generate) and the **reader** (paged text + illustration, per-Page candidates/re-roll). Reuses the existing pipeline + gate; gate is force-unlocked in the simulator (`DEV_FORCE_SUBSCRIPTION`). |

## 3. Locked decisions

1. **Mobile-only, features-first.** No web changes beyond the Bearer API routes the
   mobile client needs. The iOS Simulator is the test surface.
2. **Payment is deferred to its own `/part1`.** No paywall UX, no pricing, no live
   Stripe/RevenueCat in this wave. The existing `isActive` gate stays; the simulator
   force-unlocks it via `DEV_FORCE_SUBSCRIPTION`. The recorded future direction
   (Free + one paid + credits; gate moves off illustrations) is captured in CONTEXT.md
   and the ADR-0009 note, and opens the payment wave with a **new ADR**, not code.
3. **Wire, don't rewrite.** Mobile is a native front-end over the existing services
   (ADR-0018). New server code is limited to **Bearer API route handlers** that mirror
   existing web server actions/services — tested at the same service seam with fakes.
4. **Reuse the Maya's World kit.** All new mobile UI uses
   `mobile/constants/theme.ts` (`C`/`R`) + `mobile/components/maya-ui.tsx`; no new
   design tokens. (Brand font loading stays a separate follow-up, per the 06-15 handoff.)
5. **Journal/Firsts are free / tier-agnostic.** Only Storybook **generation** touches
   the (force-unlocked) gate; reading/curating a generated book does not re-gate.
6. **Suggestion contract is preserved.** Every "make this a Story" path is an offer the
   parent confirms (picks Story Type) before any generation spend — never background
   generation.

## 4. Scope — four threads

### 0. Social-only auth (Apple + Google)
- **Sign-in/sign-up is social-only**: **Login with Apple** and **Login with Google**,
  via Supabase OAuth. **Remove email + password** entirely (no username/password UI
  on mobile). Apple Sign-In is mandatory once Google is offered (App Store Guideline
  4.8) and is the native-iOS first-class path anyway.
- Mobile: `expo-apple-authentication` for Apple, Supabase OAuth (`signInWithIdToken`
  / `expo-auth-session`) for Google; rebuild `sign-in.tsx`/`sign-up.tsx` on the kit
  with the two provider buttons only.
- Backend: ensure the Supabase project has Apple + Google providers enabled and the
  `auth/callback` path still mints the same session the Bearer API expects. No new
  domain model — a Member is still created on first sign-in.

### A. Parity backbone (foundation)
- **Bearer API routes** for the surfaces mobile needs that don't exist yet:
  `POST/GET /api/moments` (create + list per Baby, with `momentType`, date, linked
  people, `significant`), and `POST /api/storybooks` (create/generate from a Brief) +
  `GET /api/storybooks` (list for the World). Mirror existing services; auth via the
  same Bearer-token path as `/api/home`.
- **Wire the stubbed handlers**: `daily.tsx` add-moment → real create + refetch;
  `characters/[id].tsx` → fetch the character and pass its questionnaire as `initial`;
  `family/new.tsx` submit → real roster/persona create; `account.tsx` actions →
  real account/hard-delete calls.
- Extend `mobile/lib/api.ts` with typed clients for the above.

### B. Mobile Journal (Moments + Firsts)
- Per-Baby **timeline** view over `GET /api/moments` (replaces `daily.tsx` mock state).
- **Firsts** filtered view (`momentType === "first"`/milestone) with the **inline
  "Make this a Story" offer** that routes into the Storybook create flow with the
  Moment seeding the Brief/theme.
- **Daily nudge** card surfaced on the mobile home (the capture habit), reusing
  `journal-nudge.ts`. (Native push wiring already exists via `push/register`; firing a
  scheduled nudge push is **out of scope** here — surface the card only.)

### C. Mobile Storybook (generate + read)
- **Generate**: a native Brief flow (pick starring cast + Story Type + theme,
  optionally pre-seeded from a Moment) → `POST /api/storybooks` → poll status.
- **Reader**: paged text + illustration, with the existing `generating → draft →
  finalized` lifecycle surfaced; per-Page **re-roll/candidate** pick where the API
  supports it (`/api/storybooks/[id]`).
- Gate: generation calls the existing `isActive` check; the simulator runs with
  `DEV_FORCE_SUBSCRIPTION=active` so the product owner can exercise the full path.

## 5. Out of scope (explicit)

- **All monetization** — paywall, pricing, Stripe/RevenueCat live billing, the
  gate-move, Persona caps, credits. Separate `/part1`.
- **Web feature changes** beyond the new Bearer API routes.
- **Voice clips, Photo-to-story (Moment photo), Birthday Story on mobile, video pages**
  — later mobile waves (the user picked Journal + Storybook for this one).
- **Brand font loading** on mobile (separate polish pass).
- **Scheduled nudge push firing**, TestFlight/EAS submission, App Store review prep.

## 6. Testing decisions

- Test the **new API routes at the service seam** with provider adapters faked
  (Anthropic, fal, moderation) — same discipline as the web routes. Assert Bearer-auth
  rejection (401 without token) and Family-scoping.
- Mobile screens: exercise the wired handlers against a fake/seeded backend; don't test
  Expo render internals. Verify the moment create → timeline refetch loop and the
  generate → reader happy path manually on the Simulator (HITL), recorded in the handoff.
- No new pipeline/Inngest internals tested — those are covered upstream.

## 7. Open questions (non-blocking)

- Does `/api/storybooks/[id]` already expose per-Page candidate/re-roll, or does the
  reader need a small extension? (Resolve in the first Storybook slice.)
- Multi-Baby selection on mobile (which World a Moment/Storybook belongs to): assume the
  member's default Baby for v9 unless the home payload already carries a selected Baby.
