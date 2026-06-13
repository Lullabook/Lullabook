# INTEGRATION-FOR-OPUS — Native iOS App Store submission runbook

> Human-in-the-loop steps only Opus + the operator can perform. Code/config is
> already in the repo (`/mobile`, Bearer API routes, RevenueCat webhook, Email-Plus
> VPC). Follow in order.

## 1. Apple Developer enrollment

1. Go to [Apple Developer Program](https://developer.apple.com/programs/) → Enroll.
2. Complete identity verification (1–2 days typical).
3. **Credential produced:** Apple Team ID (10 chars) → paste into:
   - `mobile/eas.json` → `submit.production.ios.appleTeamId`
   - `public/.well-known/apple-app-site-association` → replace `YOUR_APPLE_TEAM_ID`

## 2. App Store Connect app record

1. [App Store Connect](https://appstoreconnect.apple.com/) → Apps → **+** → New App.
2. Platform: iOS. Name: **Lullabook**. Bundle ID: **`com.lullabook.app`** (register in Developer portal first if missing).
3. Category: **Books** or **Education**. Age rating: **4+**, parents — **not** Kids Category.
4. **Credential produced:** ASC App ID (numeric) → `mobile/eas.json` → `ascAppId`.

## 3. API keys (.p8 files)

### App Store Connect API (EAS Submit)

1. App Store Connect → Users and Access → Integrations → **App Store Connect API** → Generate Key.
2. Download `.p8`, note Key ID and Issuer ID.
3. Run `eas credentials` and upload when prompted, or store in EAS secrets.

### In-App Purchase (StoreKit)

1. App Store Connect → your app → **Subscriptions** → create group **Lullabook Premium**.
2. Add products: **monthly** and **annual** (no free trial).
3. Note product IDs for RevenueCat.

### APNs (push via Expo)

1. Apple Developer → Certificates, Identifiers & Profiles → Keys → **+** → Apple Push Notifications.
2. Download `.p8` → upload to Expo project (`eas credentials` → Push Notifications).

## 4. EAS project

```bash
cd mobile
npm install -g eas-cli
eas login
eas init          # creates EAS project → paste projectId into app.config.ts extra.eas.projectId
eas build:configure
```

## 5. Environment variables

Root `.env` / hosting (Vercel):

- Existing Supabase, Anthropic, fal, Stripe, Resend keys unchanged.
- Add `REVENUECAT_WEBHOOK_SECRET=<random>` → configure same value in RevenueCat webhook Authorization header.

Mobile `mobile/.env` (EAS secrets for builds):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=https://your-production-domain
```

## 6. TestFlight build

```bash
cd mobile
eas build --platform ios --profile preview
eas submit --platform ios --profile preview
```

1. App Store Connect → TestFlight → add internal testers.
2. Install on device; sign up → cold-start home loads roster via Bearer `/api/home`.

## 7. RevenueCat

1. [RevenueCat](https://app.revenuecat.com/) → New Project → iOS app → bundle `com.lullabook.app`.
2. Upload App Store Connect **In-App Purchase** `.p8` (or Shared Secret for legacy).
3. Create entitlement **`active`**; attach monthly + annual App Store products.
4. Webhook URL: `https://<your-domain>/api/webhooks/revenuecat`
   - Authorization: `Bearer <REVENUECAT_WEBHOOK_SECRET>`
5. Sandbox test purchase → verify Family subscription flips `active` in Postgres.

## 8. Supabase Auth — Sign in with Apple

1. Supabase Dashboard → Authentication → Providers → Apple → enable.
2. Apple Developer → Services ID + key for Sign in with Apple → paste into Supabase.
3. Redirect URLs include `com.lullabook://**` and production web callback.

## 9. Email-Plus VPC (Resend)

1. Confirm `RESEND_API_KEY` sends from verified domain.
2. Test flow: POST `/api/consent/email-plus/request` (Bearer) → open link → POST confirm → delayed revoke email arrives.

## 10. App Privacy + listing

1. App Store Connect → App Privacy → declare photos (Persona creation), email (auth + VPC), purchase history (IAP).
2. Screenshots (6.7" + 6.5" required), description, keywords — **avoid "for kids"** in name/keywords.
3. Privacy policy URL hosted on your domain.

## 11. Submit for review

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

App Store Connect → select build → Submit for Review.

**Review notes for Apple:**

- Free tier: Character + text Stories (no IAP required to try).
- Paid: illustrated Storybooks via IAP; Baby Persona requires Email-Plus parental consent.
- Account deletion: in-app (Account → Delete Account, types DELETE).
- Paywall shows auto-renew price/period and link to manage subscriptions.

## 12. Post-launch checks

- [ ] Stripe web subscriber and IAP subscriber both reach `active`.
- [ ] Hard-delete removes push tokens + text stories (test in staging).
- [ ] Share links + AASA open in app (`/share/*`).
