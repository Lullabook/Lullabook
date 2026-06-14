# 60 — Two-mode local dev: free vs subscribed experience side by side

Triage: ready-for-agent

## What to build
Make it one command to compare the **non-subscribed** and **subscribed** experiences
locally, by running two dev servers seeded to opposite Subscription states. (Paywall
gating is still deferred; this only exercises the existing `active`/`inactive`
Subscription state and the `canCreateBabyPersona` gate — it does not design pricing.)

- npm scripts: `dev:free` (port 3000) and `dev:paid` (port 3001). Each starts
  `next dev` on its port with an env that forces the dev session's Family Subscription
  state (e.g. `DEV_FORCE_SUBSCRIPTION=inactive|active`), read in the dev/seed path
  only — never on the production code path.
- Dev seed: extend the existing dev seed (`src/components/v2/dev-seed-button.tsx` /
  the seed it calls) so one seeded Family is `active` and one is `inactive`, or have
  the forced-state env stamp the seeded Family's subscription accordingly.
- Guard: the force-subscription override is a no-op when `NODE_ENV === production`.
- Doc: a short note in `CONTEXT/local-dev/RUN-LOCAL.md` — "run `npm run dev:free` and
  `npm run dev:paid` to compare the two experiences."

## Acceptance criteria
- `npm run dev:free` serves the app on :3000 with the gated (no-subscription)
  experience; `npm run dev:paid` serves on :3001 with the unlocked experience.
- The difference is visible where the Subscription gate actually bites (e.g. promoting
  a Character → Baby Persona / illustrated features) per ADR-0009/0016.
- The override has no effect in production builds.
- `RUN-LOCAL.md` documents the two-mode workflow. Existing tests stay green.

## Blocked by
(none)
