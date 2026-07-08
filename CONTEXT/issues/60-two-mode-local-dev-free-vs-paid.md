# 60 — Two-mode local dev: free vs subscribed experience side by side
Status: shipped
Added `npm run dev:free` (port 3000, forced `inactive` Subscription) and `dev:paid` (port 3001, forced `active`, plus `DEV_DEMO_SEED`/`DEV_FAL_FALLBACK`/`DEV_LIVENESS_BYPASS`) via `DEV_FORCE_SUBSCRIPTION`, a no-op in production. Both scripts are still live in `package.json` and are the project's standard way to run the full stack locally.
(condensed 2026-07-07 — full spec in git history)
