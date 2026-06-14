# 63 — HITL runbook: backend deploy → EAS build → TestFlight

Triage: ready-for-agent (human-in-the-loop)

## What to build
A complete, step-by-step **runbook** (an `INTEGRATION-FOR-OPUS.md`-style doc, e.g.
`mobile/TESTFLIGHT-RUNBOOK.md`) plus the config scaffolding that gets the iOS app onto
TestFlight. Claude writes every step and fills every config placeholder it can; the
**human executes** the account-gated steps. Surface this prerequisite up front:
**TestFlight requires an Apple Developer Program membership ($99/yr) — it is the gate;
nothing uploads without it.**

Runbook sections:
1. **Apple Developer enrollment** — exact steps to enroll, create the App ID / bundle
   identifier, and create the app record in App Store Connect. Lists every value the
   human must copy back (Apple ID, Team ID, ASC App ID, bundle identifier).
2. **Config fill-in** — replace the placeholders in `mobile/eas.json`
   (`YOUR_APPLE_ID`, `YOUR_ASC_APP_ID`, `YOUR_APPLE_TEAM_ID`) and set a real
   `name`/`slug`/`ios.bundleIdentifier` in `mobile/app.json` (currently `"mobile"`).
   Document each field and where its value comes from.
3. **Backend deploy** — deploy the Next.js backend to **Vercel** (env vars from
   `.env.example`: Supabase, R2/`BLOB_S3_*`, Anthropic, fal, Stripe/RevenueCat,
   Inngest, Resend, etc.), and point the mobile app's API base URL at the deployed
   origin (a TestFlight build runs on a real device and cannot reach `localhost`).
4. **EAS build + submit** — `eas build --platform ios --profile production` then
   `eas submit --platform ios`; how to add the build to a TestFlight internal testing
   group and invite testers.
5. **Smoke checklist** — sign in, add a family member (real R2 in prod), see the Roster
   avatar (issue 62), generate a story — confirm the deployed path end to end.

## Acceptance criteria
- The runbook is self-contained: a human with no prior Apple/EAS knowledge can follow
  it from enrollment to an installed TestFlight build.
- Every `eas.json`/`app.json` placeholder is documented with its source value; a real
  bundle identifier is chosen and recorded.
- The backend deploy step lists every required env var and where it's set.
- The Apple Developer prerequisite is stated as a hard blocker, not an afterthought.
- No secrets are committed; the runbook references env vars, never their values.

## Blocked by
62 (so the TestFlight build ships the roster-avatar rule); soft-depends on a deployed
backend, which this runbook sets up.
