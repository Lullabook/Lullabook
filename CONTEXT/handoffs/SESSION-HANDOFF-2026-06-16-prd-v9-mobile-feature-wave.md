# Session Handoff — 2026-06-16: `/part1` PRD v9 (native mobile feature wave)

> Branch: `plan/photo-stories-firsts-birthday-64-73`. **Planning only — no app code.**
> A pointer map, not a restatement; read the referenced artifacts.

## What this session did

Ran `/part1` (grill → PRD → issues → handoff → push). The user is iterating on the
**native Expo app** in the iOS Simulator (with GPT 5.5 on design) and asked to audit
current features, plan more, and handle payment.

**Audit finding:** the payment plumbing already exists (Stripe + RevenueCat adapters,
both webhooks, `subscription.ts`, billing page, `isActive` gate wired into
`storybook.ts`/`(app)/layout.tsx`/`cast-limits.ts`) but monetization was **deferred**
through PRD v5–v8. The mobile app is a themed shell with **stubbed submit handlers** and
lacks Journal/Storybook on device.

## Locked decisions (from the grill)

1. **This wave is mobile-only, features-first.** iOS Simulator is the test surface.
2. **Payment deferred to its own later `/part1`.** Pricing direction *recorded* (not
   built): **Free + one paid tier + credits**; the gate **moves off illustrations**
   (illustrations become free/short) to narration + real-voice weave + video + length.
   This supersedes parts of ADR-0009/0016 → the payment wave opens with a **new ADR**.
3. **Auth = social-only: Login with Apple + Login with Google. No username/password.**
4. **Wire, don't rewrite** — mobile is a native front-end over existing services
   (ADR-0018); new server code = Bearer API route handlers only.
5. Feature areas chosen: **Journal/Moments/Firsts** + **Storybook generation + reader**.

## Artifacts produced

- **CONTEXT.md** — new "Native mobile feature wave — incoming language (PRD v9)" section
  (Mobile parity backbone, Mobile Journal, Mobile Storybook) + recorded payment direction.
- **ADR-0009** — 2026-06-16 note: monetization deferred, gate moving, pending new ADR.
- **PRD:** `CONTEXT/planning/prd-v9-mobile-feature-wave.md` — vision, model, locked
  decisions, four scope threads (social auth, parity backbone, Journal, Storybook),
  out-of-scope (all monetization), testing decisions.
- **Issues 74–81** in `CONTEXT/issues/` (mirrored to GitHub **#17–24** — local numbers
  are canonical; Blocked-by uses local numbers):

  | Local | Slice | Blocked by | GH |
  |---|---|---|---|
  | 74 | API: Moments create/list (Bearer) + mobile client | 50 | #17 |
  | 75 | Mobile Journal: wire Daily → real capture + timeline | 74 | #18 |
  | 76 | Mobile Firsts view + inline story offer | 75, 78 | #19 |
  | 77 | API: Storybook create/generate + list (Bearer) | — | #20 |
  | 78 | Mobile Storybook generation (Brief → poll) | 77 | #21 |
  | 79 | Mobile Storybook reader (paged + candidates) | 78 | #22 |
  | 80 | Wire remaining stubs (char edit, family/new, account) | — | #23 |
  | 81 | Social-only auth (Apple + Google) | — | #24 |

## Next agent starts at

**Issue 74** (or **81**/**77**/**80** in parallel — all unblocked). Use `/part2`,
TDD. Test new API routes at the service seam with adapters faked (401 + scoping);
exercise mobile flows on the Simulator (HITL) and record the manual passes.

## Not done / deferred

- All monetization (paywall, pricing, live billing, gate-move, Persona caps, credits)
  — separate `/part1` opening with a new ADR.
- Mobile brand fonts (Baloo 2 / Nunito), scheduled nudge push firing, TestFlight/EAS,
  Voice/Photo-to-story/Birthday/video on mobile — later waves.
