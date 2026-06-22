# Run Lullabook locally (a web version you can look at)

The cheapest path to a clickable app. You need exactly **one free account
(Supabase)**. Anthropic is optional and only needed to generate a real text Story.

The composition root (`src/lib/context.ts`) wires the real Supabase data store on
every request, and auth runs on every page — so a real Supabase project is the
hard floor. There is no in-memory demo mode. Other providers (fal, Stripe, etc.)
are read lazily, so you can click through the whole UI without them; only the
specific action that calls one will fail until its key is set.

## 1. Create a Supabase project (free, ~5 min)

1. Sign up at https://supabase.com → **New project**. Pick any name + a DB
   password (you won't need the password again for this).
2. Wait for it to provision (~2 min).
3. **Project Settings → API.** Copy three values into `.env.local` at the repo root:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Apply the database schema

1. Supabase Dashboard → **SQL Editor → New query.**
2. Open `CONTEXT/local-dev/schema.sql`, paste the whole thing, **Run.**
   (It's migrations 001–003 concatenated. Run once on the fresh project.)

**Already ran `schema.sql` before June 2026?** Your project is missing newer
tables (`babies`, `moments`, etc.). Run the incremental script once:

1. SQL Editor → New query.
2. Paste `CONTEXT/local-dev/schema-incremental-004-007.sql` → **Run.**

**Need roster avatars (issue 58)?** Also run `supabase/migrations/008_avatar_key.sql`
(or add `avatar_key text` to `personas`).

## 3. Turn OFF email confirmation (so sign-up logs you straight in)

Supabase defaults to requiring an email-confirmation click. Sign-up redirects to
`/library`, which bounces back to sign-in until the session is active — so for
local viewing, disable confirmation:

- **Authentication → Providers → Email** (or **Sign In / Providers**) →
  turn **Confirm email** OFF → Save.

(Leave it on if you'd rather click the confirmation link in your inbox each time.)

## 4. Run it

```bash
npm install      # first time only
npm run dev
```

Open http://localhost:3000 → **Create your Family** → sign up with any
email/password. You land in the Library and can click through Personas,
Characters, Storybooks, Billing, Account, etc.

**Without `BLOB_S3_*` keys**, uploaded photos and generated roster avatars persist
under `.localblob/` locally (issue 57) — adding family members works without R2.

### Compare free vs subscribed locally (issue 60)

Run two servers side by side:

```bash
npm run dev:free   # http://localhost:3000 — DEV_FORCE_SUBSCRIPTION=inactive
npm run dev:paid   # http://localhost:3001 — DEV_FORCE_SUBSCRIPTION=active
```

Sign up (or use two browsers) to see paywall-gated vs unlocked flows.

> **`DEV_FORCE_SUBSCRIPTION` is a dev-only override — it must never ship enabled.**
> It is deliberately omitted from `.env.example` (it is not a real env var). The
> only legal reads are the inline values set by the `dev:free` / `dev:paid` npm
> scripts in `package.json`. A hard guard in `src/services/subscription.ts`
> short-circuits to `undefined` when `NODE_ENV === "production"`, so the override
> is inert in a built/prod build — confirmed by `tests/60` ("no effect in
> production"). **Why this matters:** with issue 91 / ADR-0023, the
> `EntitlementService` is the server-side source of truth for tier, Story cap,
> member cap, and capability gates; `DEV_FORCE_SUBSCRIPTION` is a *dev convenience*
> that force-flips the underlying subscription's `isActive` bit so a simulator
> can exercise paid flows without IAP. If it ever leaked to prod, every Household
> would read as entitled and the tier/credit boundary (issues 92–95) would be
> bypassable client-side — a direct violation of ADR-0023's "no child likeness
> without card-on-file VPC" cornerstone. Do not weaken the production guard, do
> not add new read sites without the guard, and do not list it in any shipped
> env file.

## 5. (Optional) Generate a real text Story

Uncomment `ANTHROPIC_API_KEY` in `.env.local`, paste a key from
https://console.anthropic.com, restart `npm run dev`. The free-tier
character + text-story flow will produce real output. Illustrated Storybooks
additionally need fal.ai + a blob store + Inngest (see `.env.example`).

## What still won't work without more keys

| You click… | Needs |
|------------|-------|
| Generate text Story | Anthropic |
| Create Persona / illustrated Storybook | fal.ai + R2/S3 + Inngest |
| Upload a real child/adult photo (safety scan) | Sightengine + Rekognition |
| Subscribe / billing checkout | Stripe |
| Email / push notifications | Resend / VAPID |

Full account list and tiers: see the session handoff that introduced this doc.
