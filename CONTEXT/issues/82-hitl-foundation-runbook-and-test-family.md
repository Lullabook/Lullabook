# 82 — HITL foundation: smoke runbook scaffold + test-Family setup

Triage: ready-for-agent (HITL)

## Parent
PRD v10 — `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`

## What to build
The foundation every other HITL slice builds on: the consolidated runbook doc and the
reproducible test environment. Claude writes the runbook; the human executes the
account-gated steps. **No app code change** unless a defect surfaces.

- Create `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` (scaffold + shared sections):
  - **Environment bring-up:** `npm run dev:paid` (:3001), Simulator boot, Expo against
    `:3001` (reuse the existing dev scripts / `mobile/scripts/`), confirm `DEV_FORCE_SUBSCRIPTION` is on.
  - **Env/secrets checklist:** every var the real path needs (Supabase, `BLOB_S3_*`/R2,
    Anthropic, fal, etc.) by **name only** — never values; reference `.env.example` and
    `CONTEXT/local-dev/RUN-LOCAL.md`.
  - **OAuth provider prerequisites:** what must be configured in Supabase (Google
    provider + redirect URL; Apple provider) before auth slices can pass.
  - **Dedicated test Family setup:** how to create a throwaway test account + Baby with
    **dev/sample photos only** (no real children's photos, no prod users).
  - **Global PASS/FAIL results table** template + the **invariants** from PRD v10
    (latency budgets, failure modes, security boundaries) stated as the measuring stick.
  - **Defect path:** how to file a `bug` + `ready-for-agent` issue with repro when a step FAILs.

## Acceptance criteria
- [ ] `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` exists with the bring-up, env checklist,
      OAuth prerequisites, test-Family setup, results table, and defect path.
- [ ] The invariants (≤5 min draft, ≤30s page, p95<1s, failure-mode + boundary rules) are
      copied in as the explicit PASS/FAIL contract.
- [ ] A human can follow it to a running Simulator + backend with a dedicated test Family,
      with zero real secrets committed (env-var names only).
- [ ] Defect-filing instructions are concrete (label, repro template).

## Blocked by
None — start here.
