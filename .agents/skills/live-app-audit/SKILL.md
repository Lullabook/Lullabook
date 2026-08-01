---
name: live-app-audit
description: Audit the whole Lullabook app live by exercising every feature end-to-end across BOTH the free and paid tiers — sign-up, characters, family/persona creation, illustrated Storybook generation, audio/voice, sharing, export, and hard-delete — then report concrete pass/fail with repro steps. Use when the user wants a full live feature audit, a pre-release smoke, to "test everything", or asks to verify the app works across free and paid.
---

# Live App Audit

A full-app, browser-driven feature audit. **Every run delegates to the `hermes`
subagent** (the integration/E2E specialist) — this skill is the orchestration and
the checklist; hermes does the live driving and reporting.

## What it does

Drives the running app like a real Guardian and verifies each feature actually
works (not just unit-green): account flows, the free text-only path, and the full
paid illustrated + voiced path — on both tiers, reporting what passed, what broke,
and the root cause + file:line for each failure.

## Run it

1. **Confirm scope** with the user (default = everything, both tiers). Optionally
   narrow to one tier or one feature area.
2. **Launch the hermes subagent** with the audit brief below. Always use the Task
   tool with `subagent_type: "hermes"`. Do not run the audit inline — hermes owns
   the browser/E2E context.
3. **Relay hermes's report** to the user verbatim (the pass/fail table + failures),
   then offer to fix the highest-severity failure.

### The brief to pass hermes

> Run a full live feature audit of Lullabook across **free (:3000)** and **paid
> (:3001)** tiers. Start/confirm `npm run dev:free` and `npm run dev:paid`, ensure
> Supabase + migrations and (optional) Inngest are up. Then exercise every flow in
> `.Codex/skills/live-app-audit/REFERENCE.md` §Flow matrix, capturing URL, console,
> and network on any failure. For paid, exercise illustrated Storybook generation
> end-to-end (Brief → pages → illustrations → finalize), audio/voice narration,
> Share link, PDF export, and hard-delete propagation. Produce the report in the
> hermes "Report format", and add a **per-feature PASS/FAIL/BLOCKED** table plus a
> top-3 prioritized fix list. Don't merge or push.

## Tiers & infra (ground truth)

- **Free** = `npm run dev:free` → `:3000` (`DEV_FORCE_SUBSCRIPTION=inactive`).
- **Paid** = `npm run dev:paid` → `:3001` (`DEV_FORCE_SUBSCRIPTION=active`).
- Without `INNGEST_EVENT_KEY`, jobs run inline (`LocalDevWorkflowAdapter`) so
  generation completes locally. See `CONTEXT/local-dev/RUN-LOCAL.md`.
- Gate line (ADR/PRD): **text is always free; illustration + Personas are paid.**

## Output

Surface hermes's report to the user: the PASS/FAIL/BLOCKED table by feature, each
failure's symptom → cause → fix (file:line), HITL follow-ups Playwright can't cover
(real photo upload, real fal training/voice), and the top-3 fixes to make next.

## Full flow matrix & severity rubric

See [REFERENCE.md](REFERENCE.md) — the exhaustive per-feature checklist across both
tiers (web; iOS Simulator parity where relevant) and the severity rubric.

## Don't

- Don't run the audit inline — always delegate to `hermes`.
- Don't commit, push, or merge as part of the audit.
- Don't treat unit-green as "it works" — this skill exists to catch wiring bugs.
