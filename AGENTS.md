# AGENTS.md — Lullabook

Project rules for any coding agent (Antigravity, Cursor, Claude Code, etc.).

## What this is

A web app where a parent generates illustrated AI **Storybooks** starring their
own baby and family via photo-conditioned per-persona LoRAs. Greenfield.

## Read before coding (source of truth)

- **Glossary:** `CONTEXT/CONTEXT.md` — use this vocabulary in code + UI. Notably:
  **Brief** (parent input) vs **Prompt** (engineered model input); **Guardian**
  (accountable adult) vs **Member**; **Adult Persona** (not "Parent Persona");
  **Hard-delete** (not soft-delete/archive).
- **Decisions:** `CONTEXT/docs/adr/0001–0015` — respect these; don't silently
  contradict them.
- **PRD:** `CONTEXT/planning/prd-v1.md`. **Stack:** `CONTEXT/planning/stack.md`.
- **Work items:** `CONTEXT/issues/` — dependency-ordered tracer-bullet slices.
  Start at `01-walking-skeleton.md`, follow `Blocked by`.
- **Handoffs & Session Logs:** `CONTEXT/handoffs/` — historical session logs and
  handoffs.

### Documentation and Context Organization
- Every document in the `CONTEXT/` directory must be organized into a specific category folder (e.g. `docs/adr/`, `planning/`, `issues/`, `handoffs/`).
- Do not create free-floating files in the root of the `CONTEXT/` directory. If a file fits a category, it must be placed into that category's folder to maintain cleanliness.

## Non-negotiables (from the ADRs)

- Per-Family data isolation via **row-level security**, not just app checks.
- No minor's photo reaches storage/training before the **consent gate** + **moderation**.
- Child-age / consent / residency are **per-jurisdiction config**, never hardcoded.
- **Hard-delete** must propagate across DB *and* blob storage.
- External providers (Anthropic, fal.ai, moderation, liveness) live behind
  **adapter interfaces** so tests can fake them.
- Never commit secrets; `.env` is gitignored.

## How to work

- **TDD**: test external behavior at the service/use-case seam with providers
  faked; integration-test RLS isolation + hard-delete. Don't test framework
  internals or React render details.
- After meaningful changes, run the **Kaizen Domain Coach**:
  `bash tools/kaizen-coach/coach.sh` → then act on `KAIZEN-REVIEW-BRIEF.md`
  per `tools/kaizen-coach/COACH.md`.

## Agent skills

### Issue tracker

GitHub Issues on `VrajGupta/Lullabook` (via `gh` CLI); local tracer bullets in `CONTEXT/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout under `CONTEXT/` (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

## Agent fleet

- **Antigravity** → Production Coach. Responsible for the 'Kaizen Production' gate (security, infra wiring, observability, runbooks, deletion proof, ADR compliance).
- **Cursor** → Primary TDD implementation.
- **Hermes** → Integration/E2E agent. Wires infrastructure (e.g. Supabase locally), runs Playwright against flows (e.g., sign-up → Baby Persona consent gate), and proves the happy path in a browser.
