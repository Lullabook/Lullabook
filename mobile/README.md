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
