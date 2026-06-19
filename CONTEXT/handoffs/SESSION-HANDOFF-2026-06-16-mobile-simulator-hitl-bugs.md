# Session Handoff — 2026-06-16: mobile Simulator HITL bugs (Add Family)

> Human-in-the-loop pass on the paid iOS Simulator after PR #26 (`plan/photo-stories-firsts-birthday-64-73`).
> Sign-in and home roster were unblocked in-session; **Add Family photo upload remains the P0 blocker**
> for closing **issue 70**.

## Environment (repro)

1. Web: `npm run dev:paid` on `:3001` (`DEV_FORCE_SUBSCRIPTION=active`).
2. Mobile: `cd mobile && npm run ios:paid` (sets `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001`).
3. Keep **IPv4 Metro proxy** running if Expo Go cannot reach bundle:
   `node scripts/ipv4-metro-proxy.mjs` (`127.0.0.1:8081 → [::1]:8081`).
4. Dev sign-in (Supabase email/password, not OAuth): use `EXPO_PUBLIC_DEV_EMAIL` /
   `EXPO_PUBLIC_DEV_PASSWORD` from `mobile/.env` — **never commit `.env`**.

Screenshots (workspace assets):

- `assets/simulator_screenshot_9455B0F8-…png` — FormData error on Start training
- `assets/simulator_screenshot_76E220F2-…png` — uncaught promise on Take a selfie

## Bugs found (PASS/FAIL)

| ID | Severity | Screen | Repro | Observed | Root cause / status |
|----|----------|--------|-------|----------|-------------------|
| **B1** | **P0** | Add family (Baby) | Pick 3+ photos → consent → **Start training** | Inline red: **"Unsupported FormDataPart implementation"** | `submit()` appended `{ uri, name, type }` objects cast as web `Blob`. React Native needs native file parts via `appendNativeFile` / `setNativeFile` (`mobile/lib/form-data.ts`). **Fix wired on branch `handoff/2026-06-19-live-app-audit-and-native-upload`.** Needs HITL re-run. |
| **B2** | **P0** | Add family (Adult) | Pick 7 photos → **Take a selfie** | Red toast: **"Uncaught (in promise) Error: Missing…"** (truncated) | `takeSelfie()` called `launchCameraAsync` without `requestCameraPermissionsAsync` and no `try/catch` → unhandled rejection. **Fix: permission gate + surfaced error on same branch.** Needs HITL re-run on device/simulator with camera. |
| **B3** | P2 | Stack screens (e.g. Add family) | Navigate from tabs into stack route | Back button label **"(tabs)"** instead of human title | Expo Router `headerBackTitle` inherits `(tabs)` group name. Cosmetic; set `headerBackTitle: "Back"` or hide on `_layout.tsx` stack options. |
| **B4** | P2 | Sign-in | Tap **Continue with Google** | Supabase JSON: **"Unsupported provider: provider is not enabled"** | Google OAuth not enabled in Supabase project dashboard. Dev email one-tap path is the simulator workaround (`mobile/app/sign-in.tsx`). Enable Google (and Apple for real HITL) in Supabase for production smoke. |
| **B5** | P1 | Expo Go | Reload / cold open app | **"Could not connect to the server"** at `127.0.0.1:8081` | Metro bound IPv6-only; Expo Go requests IPv4. Use `mobile/scripts/ipv4-metro-proxy.mjs` + `npm run ios:paid`; restart proxy if killed (exit 143). |
| **B6** | — fixed | Home | Sign in on paid backend | **Subscription: free** despite `dev:paid` | `/api/home` ignored `DEV_FORCE_SUBSCRIPTION`. Fixed in commit `ece605d` on PR #26 (`ctx.subscriptions.isActive()` override). **Verify on device after merge.** |

## What already shipped (same session, PR #26)

- Dev email sign-in + Apple button always on iOS
- Root redirect `mobile/app/index.tsx` → `/(tabs)`
- Baby vs adult form fields on Add family (hide relationship block for baby)
- Metro IPv4 proxy + `ios:paid` / `start:paid` npm scripts
- `POST /api/personas` bearer route + mobile `createPersona`

## Next issue

**70 — Finish mobile photo-upload wiring** (`CONTEXT/issues/70-mobile-photo-upload-wiring.md`):

1. Re-run HITL: Baby path — 3 photos → Start training → confirm `202` + blob staged + training queued.
2. Re-run HITL: Adult path — photos + selfie + consent → same.
3. Close B1/B2 only after authenticated end-to-end pass (not just error gone).
4. Then continue PRD v10 runbook (**issue 83+**) Journal → Storybook flows.

## Suggested skills

- **`/part2` + `tdd`** — close issue 70 with upload integration smoke
- **`hermes` / `xcode-ios-dev`** — Simulator re-verification after FormData fix
- **`live-app-audit`** — full free+paid sweep once Add Family passes
- **`lullabook-design-check`** — polish B3 back-title while touching stack layout
