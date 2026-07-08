# Run Lullabook locally (a web version you can look at)

Cheapest path to a clickable app. Needs **one free account (Supabase)**;
Anthropic optional (real text Story). `src/lib/context.ts` wires a real
Supabase data store on every request and auth runs on every page — a real
Supabase project is the hard floor, no in-memory demo mode. Other providers
(fal, Stripe, etc.) are read lazily — only the action that calls one fails
until its key is set.

## 1. Create a Supabase project (free, ~5 min)

1. Sign up at https://supabase.com → **New project**. Any name + DB password
   (not needed again).
2. Wait for provisioning (~2 min).
3. **Project Settings → API.** Copy into `.env.local` at repo root:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Apply the database schema

1. Supabase Dashboard → **SQL Editor → New query.**
2. Open `CONTEXT/local-dev/schema.sql`, paste, **Run.** (Migrations 001–003
   concatenated; run once on a fresh project.)

**Already ran `schema.sql` before June 2026?** Project is missing newer
tables (`babies`, `moments`, etc.) — run once:
1. SQL Editor → New query.
2. Paste `CONTEXT/local-dev/schema-incremental-004-007.sql` → **Run.**

**Need roster avatars (issue 58)?** Also run
`supabase/migrations/008_avatar_key.sql` (or add `avatar_key text` to
`personas`).

## 3. Turn OFF email confirmation

Supabase defaults to requiring an email-confirmation click; sign-up
redirects to `/library` which bounces back to sign-in until the session is
active. For local viewing: **Authentication → Providers → Email** → turn
**Confirm email** OFF → Save. (Leave on to click the confirmation link
instead.)

## 4. Run it

```bash
npm install      # first time only
npm run dev
```

Open http://localhost:3000 → **Create your Family** → sign up with any
email/password. Lands in Library; click through Personas, Characters,
Storybooks, Billing, Account.

**Without `BLOB_S3_*` keys**, uploaded photos and roster avatars persist
under `.localblob/` (issue 57) — adding family members works without R2.

### Compare free vs subscribed locally (issue 60)

```bash
npm run dev:free   # http://localhost:3000 — DEV_FORCE_SUBSCRIPTION=inactive
npm run dev:paid   # http://localhost:3001 — DEV_FORCE_SUBSCRIPTION=active
```

Sign up (or use two browsers) to see paywall-gated vs unlocked flows.

> **`DEV_FORCE_SUBSCRIPTION` is dev-only — must never ship enabled.**
> Deliberately omitted from `.env.example` (not a real env var); the only
> legal reads are the inline values in the `dev:free`/`dev:paid` npm scripts
> (`package.json`). `src/services/subscription.ts` hard-guards it to
> `undefined` when `NODE_ENV === "production"` (confirmed by `tests/60`).
> With ADR-0023, `EntitlementService` is the server-side source of truth
> for tier/Story cap/member cap/capability gates; this var only force-flips
> `isActive` for simulator testing. A prod leak would make every Household
> read entitled, bypassing the tier/credit boundary (issues 92–95) — a
> direct violation of ADR-0023's card-on-file VPC cornerstone. Do not weaken
> the production guard, add new read sites without it, or list it in any
> shipped env file.

## 5. (Optional) Generate a real text Story

Uncomment `ANTHROPIC_API_KEY` in `.env.local`, paste a key from
https://console.anthropic.com, restart `npm run dev`. Illustrated
Storybooks additionally need fal.ai + a blob store + Inngest (see
`.env.example`).

## What still won't work without more keys

| You click… | Needs |
|------------|-------|
| Generate text Story | Anthropic |
| Create Persona / illustrated Storybook | fal.ai + R2/S3 + Inngest |
| Upload a real child/adult photo (safety scan) | Sightengine + Rekognition |
| Subscribe / billing checkout | Stripe |
| Email / push notifications | Resend / VAPID |

Full account list and tiers: see the session handoff that introduced this
doc.
