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
