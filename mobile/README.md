# Lullabook Mobile (Expo iOS)

Native iOS front-end for Lullabook. Shares **domain types only** from `../src/domain/types.ts` via `@domain/*`.

## Prerequisites

- Node 20+
- Xcode + iOS Simulator
- Expo CLI (`npx expo`)
- Root `.env` with Supabase + backend secrets; copy `mobile/.env.example` for mobile public vars

## Run in simulator

```bash
cd mobile
cp .env.example .env
npm install
npm run ios
```

Set `EXPO_PUBLIC_API_URL` to your local Next.js server (e.g. `http://localhost:3000`) and Supabase keys from the root project.

## Run on a physical iPhone

**Expo Go is dead for this project.** `mobile/` is on Expo SDK 56; the App
Store build of Expo Go ships an older SDK and refuses the project, and no
newer Expo Go exists to install. The device path is a **native development
build** signed on this Mac with a free Apple ID (7-day re-signing).

```bash
cd mobile
npm run ios:device -- --dry-run   # print the plan without building
npm run ios:device                # detect LAN address → set free-team flag → build → run on the phone
```

The command never falls back to the Simulator and never uses a loopback or
stale address; if the phone is missing or the Mac has no private LAN address
it fails with a named error. Full walkthrough (signing in to Xcode, trusting
the developer profile, the 7-day expiry, expected degradations, firewall
fix): `CONTEXT/local-dev/RUN-ON-IPHONE.md`.
## EAS builds

```bash
cd mobile
eas login
eas build:configure
eas build --platform ios --profile development   # simulator/dev client
eas build --platform ios --profile preview       # TestFlight internal
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

See `CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md` for Apple Developer / RevenueCat / App Store Connect steps.
