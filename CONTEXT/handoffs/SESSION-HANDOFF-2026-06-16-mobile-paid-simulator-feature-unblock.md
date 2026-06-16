# Session Handoff — 2026-06-16: mobile paid simulator feature unblock

> Branch: current workspace branch. This session focused on making the Expo iOS app
> open in paid local mode, replacing dead mobile controls with real routes/handlers,
> and bringing the touched native screens closer to Maya's World.

## What changed

1. **Paid simulator is running.**
   - Restarted the paid web backend with `npm run dev:paid` on `:3001`
     (`DEV_FORCE_SUBSCRIPTION=active`).
   - Restarted Expo for iOS with `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001`.
   - Expo/Metro bound only to IPv6 loopback on this machine, while Expo Go requested
     `127.0.0.1`; added a temporary local TCP proxy:
     `127.0.0.1:8081 -> [::1]:8081`.
   - Final simulator screenshot:
     `test-results/mobile-paid-simulator-final.png`.

2. **More hub / feature routes no longer fall into missing screens.**
   - `mobile/app/(tabs)/two.tsx` now links Characters to a real list screen.
   - Added `mobile/app/characters/index.tsx`.
   - Added `mobile/app/storybooks/new.tsx` and `mobile/app/storybooks/[id].tsx` so
     Daily's "Turn into a story" path opens a real story flow.
   - Replaced the default Expo not-found and modal templates with branded Lullabook
     screens.

3. **Native actions are wired instead of inert.**
   - Character creation now calls `POST /api/characters` via `mobile/lib/api.ts`.
   - Real-person Character selection routes to Add Family instead of violating the
     fictional-only Character invariant.
   - Add Family now sends multipart photo/selfie data to a new bearer-authed
     `POST /api/personas` endpoint.
   - Account buttons now provide visible simulator feedback; hard-delete calls the
     existing bearer-authed hard-delete API behind a native confirmation dialog.

4. **Mobile Persona endpoint added.**
   - New `src/app/api/personas/route.ts` mirrors the existing web server-action path:
     validates paid/cast/consent gates, stages uploaded photo bytes in the Family-scoped
     blob store, enqueues persona training, and returns `202`.

5. **Maya's World design pass.**
   - Added Baloo 2 and Nunito to `mobile/package.json`.
   - `mobile/app/_layout.tsx` loads the fonts and themes native stack headers.
   - `mobile/components/maya-ui.tsx` is safe-area aware, uses brand fonts, larger
     spacing, card shadows, and 44pt+ touch targets.
   - Swept touched screens for off-token colors/fonts/radii; remaining grep hits are
     expected 9px status dots and the non-native `+html` shell.

6. **Build gate repaired.**
   - Added the missing `createAuthClient` import in `src/lib/actions.ts`; this fixed a
     pre-existing production build failure.

## Verification

- `bash tools/kaizen-coach/coach.sh` — passed all checks; `KAIZEN-REVIEW-BRIEF.md`
  reports 10/10.
- `npm run build` — passed. Existing unused-variable warnings remain in web files.
- `POST /api/personas` unauthenticated smoke — returns `401`, proving the route compiles
  and the bearer auth gate is active.
- `mobile` type-check still fails on known pre-existing issues from the previous handoff:
  `components/ExternalLink.tsx` typed route mismatch and shared `@/domain/*` alias noise.
- Simulator: iPhone 17 booted; Expo bundle completed; final screenshot shows branded
  sign-in loaded from the paid-mode Metro session.

## Honest follow-ups

- A real authenticated photo upload smoke is still needed to fully close issue 70:
  sign in, choose 3+ photos + selfie in Add Family, confirm they stage into the blob
  store and training is queued.
- Mobile Moment persistence remains local-only; Daily can open Story creation, but the
  Moment itself is not yet saved to the backend.
- Native invite/billing management are visible connected simulator flows, but not real
  App Store/RevenueCat or invite endpoints yet.
- If Expo Go again reports it cannot connect to `127.0.0.1:8081`, keep the IPv4 proxy
  running or restart Metro in a mode that binds IPv4.

## Suggested next issue

- Finish the real-keys HITL for **issue 70 — Finish mobile photo-upload wiring**:
  validate Add Family upload end-to-end with an authenticated paid simulator session,
  then remove any remaining simulator-only affordances.
