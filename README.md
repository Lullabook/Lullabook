# Lullabook

AI storybooks starring your baby and family — written by Claude, illustrated
with per-persona LoRA models, designed for bedtime.

A parent describes a **Character** (free, text-only) or trains a **Persona**
from photos (subscription), composes a **Brief**, and a durable workflow
writes a 12-page **Storybook** — Story text, per-Page **Scenes**, and a
**Style Bible** in one structured pass, then one illustration per Page,
moderated before anything is persisted. Drafts are curated per Page
(re-rolls, candidates), then finalized, read, shared, or exported as PDF.

The full decision record lives in `CONTEXT/` (glossary, PRDs, ADRs 0001–0017,
issues). Read `CONTEXT/CONTEXT.md` first — the vocabulary there is used
everywhere in this codebase.

## Architecture in one paragraph

Next.js App Router + Supabase (Postgres + Auth, **per-Family RLS** as the
isolation boundary) + Cloudflare R2/S3 for sensitive blobs + **Inngest**
durable workflows (thin request, fat workflow; deterministic step keys
`{storybookId}/{pageIndex}/{attempt}`) + Claude `claude-sonnet-4-6` for story
text + fal.ai Flux LoRA for illustration + Stripe (the card payment doubles
as verifiable parental consent, ADR-0008). Every external system sits behind
a port in `src/adapters/types.ts`; domain services in `src/services/` are
storage- and vendor-agnostic and are tested at the service seam with fakes
(`npm test`, 87 tests). `SupabaseDataStore` (`src/db/supabase-store.ts`) is a
per-request unit of work: hydrate one Family's rows into the in-memory maps,
run services unchanged, diff-sync back.

## Run locally

Prereqs: Node 20+, a Supabase project, an Inngest account (free), and the
provider keys you intend to exercise (everything is lazily read — features
without keys fail only when used).

```bash
npm install --legacy-peer-deps   # inngest has a vite peer conflict with vitest 3
cp .env.example .env.local       # fill in what you have
```

1. **Database** — apply the migrations in `supabase/migrations/` in order
   (`001_*.sql`, `002_full_domain.sql`) via the Supabase SQL editor or
   `supabase db push`. RLS is enabled on every table; the app's writes go
   through the service-role key, end-user isolation is enforced by the
   policies plus in-memory defense-in-depth checks.
2. **App** — `npm run dev` (http://localhost:3000).
3. **Workflows** — `npx inngest-cli@latest dev` and leave it running; it
   auto-discovers `/api/inngest`. Generation, persona training, and the
   daily purge cron all run through it.
4. **Stripe webhooks** — `stripe listen --forward-to
   localhost:3000/api/webhooks/stripe`, copy the printed secret into
   `STRIPE_WEBHOOK_SECRET`.
5. **fal.ai webhook** — set `FAL_WEBHOOK_URL` to a publicly reachable
   `/api/webhooks/fal` (use a tunnel locally); training completion re-enters
   the parked workflow step.

Checks: `npm test` (87 service-seam tests, no network), `npm run lint`,
`npx tsc --noEmit`, `npm run build`.

## Deploy

Vercel (or any Node host) + Supabase + Inngest Cloud:

1. Set every variable from `.env.example` in the host's env settings
   (`INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` are required in production).
2. Apply migrations to the production Supabase project.
3. Register the deployed `/api/inngest` URL in the Inngest dashboard.
4. Point a Stripe webhook (checkout.session.completed,
   customer.subscription.deleted) at `/api/webhooks/stripe`.
5. Set `FAL_WEBHOOK_URL` to the deployed `/api/webhooks/fal`.

## Decisions made where the specs left room

- **Inngest** over Trigger.dev (first-class Next serve handler; step
  memoization maps 1:1 onto the per-Page step model) — ADR-0011 allowed either.
- **Sightengine** for image/text moderation, layered under a configurable
  CSAM hash-match endpoint that fails closed and escalates to the HITL/NCMEC
  flow (ADR-0010).
- **AWS Rekognition CompareFaces** for the adult-Persona selfie match
  (weakest-match-decides across all photos); swappable behind the same port.
- **pdf-lib** for export (pure JS, serverless-friendly).
- **Resend** for email + **web-push** (VAPID) for push.
- **Hand-rolled CSS design tokens** for the bedtime UI (no framework dep).
- **SupabaseDataStore as per-request unit of work** so the 87 tests and all
  services keep the synchronous `DataStore` seam unchanged.
- Curated classics catalog ships with Alice, Peter Rabbit, Goldilocks, Three
  Little Pigs confirmed; The Ugly Duckling is seeded `legalConfirmed: false`
  to exercise the legal gate (ADR-0017).

## Known gaps (deliberate, v1)

- Parent-initiated **illustration re-roll** spends budget and creates a
  placeholder candidate (the tracer-bullet contract the tests pin); the
  durable image pipeline currently regenerates only via the free recovery
  path. Wiring parent re-rolls through the same Inngest pipeline is the next
  slice.
- **Web push subscriptions** need a `push_subscriptions` table + service
  worker registration; until then push is a no-op and email carries
  notifications.
- Training-failure **refund** is copy, not a Stripe credit, pending billing
  policy.

## External blockers (cannot be coded around)

- Real provider keys: Supabase, Anthropic, fal.ai, R2/S3, Stripe, Inngest,
  Sightengine, Resend, AWS.
- A production CSAM hash-match vendor agreement (PhotoDNA or equivalent) and
  the NCMEC reporting relationship (launch-blocking, ADR-0010).
- Per-market legal sign-off for jurisdictions and the classics catalog
  (ADR-0015/0017).
