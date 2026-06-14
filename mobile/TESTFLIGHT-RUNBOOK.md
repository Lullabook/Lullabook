# TestFlight runbook — Lullabook iOS (issue 63)

> **Hard gate:** TestFlight requires an **Apple Developer Program** membership
> (**$99/year**). Nothing uploads to App Store Connect without it. This doc is
> HITL — a human executes the account-gated steps; the agent prepares config +
> checklists only.

## Prerequisites checklist

- [ ] Apple Developer Program enrolled (Team ID available)
- [ ] App Store Connect app record created
- [ ] Supabase project with full schema (through `008_avatar_key.sql`)
- [ ] Production backend deployed (Vercel) with all env vars from `.env.example`
- [ ] Cloudflare R2 (or S3) bucket for `BLOB_S3_*` — **required in production**
- [ ] Expo / EAS CLI installed (`npm i -g eas-cli`)
- [ ] Logged into Expo: `eas login`

---

## 1. Apple Developer enrollment

1. Go to https://developer.apple.com/programs/enroll/
2. Enroll with your Apple ID (Individual or Organization).
3. After approval, open **Certificates, Identifiers & Profiles** → note your **Team ID**.
4. **Identifiers → + → App IDs → App** → register a bundle ID, e.g.:
   - **Bundle ID:** `com.lullabook.app` (record this — used below)
5. Open **App Store Connect** → **Apps → +** → New App:
   - Platform: iOS
   - Name: **Lullabook**
   - Primary language, bundle ID from step 4
   - SKU: `lullabook-ios-1`
6. Copy back and save (not in git):
   - **Apple ID** (email used for App Store Connect)
   - **Team ID**
   - **ASC App ID** (numeric App Store Connect app id, e.g. `1234567890`)
   - **Bundle identifier** (e.g. `com.lullabook.app`)

---

## 2. Config fill-in (`mobile/`)

### `mobile/app.json`

Set real product identity (replace placeholders):

| Field | Example | Source |
|-------|---------|--------|
| `expo.name` | `Lullabook` | Product name |
| `expo.slug` | `lullabook` | Expo project slug |
| `expo.ios.bundleIdentifier` | `com.lullabook.app` | App ID from §1 |

### `mobile/eas.json` → `submit.production.ios`

| Field | Source |
|-------|--------|
| `appleId` | Apple ID email (§1) |
| `ascAppId` | Numeric App Store Connect app id (§1) |
| `appleTeamId` | Team ID (§1) |

### `mobile/.env` or EAS secrets

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | **HTTPS** origin of deployed Next.js backend (not `localhost`) |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

Set EAS secrets:

```bash
cd mobile
eas secret:create --name EXPO_PUBLIC_API_URL --value https://YOUR-VERCEL-APP.vercel.app
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT.supabase.co
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY
```

---

## 3. Backend deploy (Vercel)

1. Connect the GitHub repo to Vercel; deploy the **Next.js** root app.
2. Set **Production** environment variables (from `.env.example`):

| Variable | Required for TestFlight smoke |
|----------|-------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `BLOB_S3_ACCESS_KEY_ID` | Yes (photos + roster avatars) |
| `BLOB_S3_SECRET_ACCESS_KEY` | Yes |
| `BLOB_S3_BUCKET` | Yes |
| `BLOB_S3_ENDPOINT` | Yes (R2 endpoint if using Cloudflare) |
| `ANTHROPIC_API_KEY` | For text stories |
| `FAL_API_KEY` | For likeness training + illustrated books |
| `FAL_WEBHOOK_URL` | `https://YOUR-VERCEL-APP.vercel.app/api/webhooks/fal` |
| `INNGEST_EVENT_KEY` / signing keys | Durable persona + storybook workflows |
| `SIGHTENGINE_*` | Photo safety (or prod moderation) |
| `STRIPE_*` / RevenueCat | Billing (optional for first smoke) |
| `RESEND_API_KEY` | Email notifications |

3. Apply Supabase migrations through `008_avatar_key.sql`.
4. Verify: `curl https://YOUR-VERCEL-APP.vercel.app/api/health` (or sign-in page loads).

---

## 4. EAS build + submit → TestFlight

```bash
cd mobile
eas build:configure   # first time only
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

After submit succeeds:

1. App Store Connect → **TestFlight** tab → wait for processing (~5–30 min).
2. **Internal Testing** → create group → add the build → invite testers (Apple IDs).
3. Testers install **TestFlight** app → accept invite → install Lullabook.

---

## 5. Smoke checklist (deployed path)

On a real device with the TestFlight build:

- [ ] Sign up / sign in (Supabase auth against production)
- [ ] Add a family member with photos (R2 blob store + training webhook)
- [ ] Confirm **roster avatar** appears on home (not raw photo) — ADR-0020 / issue 62
- [ ] Open World / Family on web with same account — avatar matches
- [ ] Generate a text story (Anthropic) or illustrated book (fal + subscription)
- [ ] Hard-delete account (optional) — data + blobs purged

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| API calls fail on device | `EXPO_PUBLIC_API_URL` still `localhost` |
| Photo upload 500 | Missing `BLOB_S3_*` on Vercel |
| Training stuck | `FAL_WEBHOOK_URL` not reachable; Inngest not wired |
| Raw photo visible | Build predates issue 62 — rebuild after roster-avatar merge |
| Submit rejected | Bundle id mismatch between `app.json` and App Store Connect |

**Never commit** Apple credentials, API keys, or `.env` files.
