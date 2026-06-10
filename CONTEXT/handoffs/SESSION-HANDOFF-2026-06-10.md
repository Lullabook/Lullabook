# Lullabook — Session Handoff (2026-06-10)

For a fresh agent (target: **Cursor**, TDD). Pointer map, not a re-statement —
read the referenced artifacts.

## Session focus

A `grill-with-docs → to-prd → to-issues` run that **productionizes the
generation pipeline** (slice 06 → real) and adds **two v1 scope items** that
surfaced from a product conversation: a **free text-only Character tier** and
**Personalized Classics**.

## Current state of the codebase

- All **14 original issues are implemented as in-memory tracer-bullets** —
  `DataStore` is Map-based, every external provider (Anthropic, fal.ai,
  moderation, liveness, blob, workflow, Stripe) is a fake. **43 tests green**
  (`npx vitest run`).
- **Nothing is wired to real infrastructure yet** (no Supabase/RLS, Stripe,
  fal.ai, R2/S3, durable platform). The new issues 15–22 begin that work for the
  generation path specifically.

## What was produced this session (read these — not duplicated here)

- **PRD v2:** [`planning/prd-v2-generation-pipeline.md`](../planning/prd-v2-generation-pipeline.md)
  — problem, 30 user stories, implementation + testing decisions, seams, scope.
- **New issues 15–22:** [`issues/`](../issues/) — dependency-ordered tracer
  bullets. Three groups:
  - **A — productionize illustrated pipeline:** 15 (durable spine, single-Persona,
    real seams), 16 (idempotency & money-safety), 17 (multi-Persona composition
    **spike — HITL**), 18 (multi-Persona productionized).
  - **B — free text-only Character tier:** 19 (Character + Trait Questionnaire +
    light consent), 20 (free text-only Story), 21 (Character→Persona upgrade).
  - **C — Personalized Classics:** 22 (public-domain catalog, reuses the spine).
- **New ADRs:** [`docs/adr/0016-character-tier-two-tier-consent.md`](../docs/adr/0016-character-tier-two-tier-consent.md),
  [`docs/adr/0017-personalized-classics-public-domain.md`](../docs/adr/0017-personalized-classics-public-domain.md).
- **Glossary additions** in [`CONTEXT.md`](../CONTEXT.md): **Story Type**,
  **Character**, **Trait Questionnaire**, **Personalized Classic**; Storybook
  lifecycle is now **`generating → (draft | failed)` → finalized**.

## Where to start

1. **Issue 15 — durable generation spine.** Everything in group A hangs off it.
   Follow the `Blocked by` chains. **17 is the only HITL** (multi-Persona
   composition quality gate, ADR-0005 — needs a human go/no-go before 18).
2. Groups **B and C run parallel to A** — only issue 22 (Classics) hard-depends
   on issue 15; the text tier (19–21) is independent and can start immediately.

## Key design decisions (full reasoning in PRD v2 + ADRs)

- **Thin request, fat workflow** (ADR-0011): handler creates `generating` book +
  enqueues; `StorybookService.generate()` becomes the workflow body.
- **Sync-await fal *inference*** per Page; **training** stays webhook +
  `waitForEvent`.
- **Image path:** fetch → **moderate bytes before any persist** → R2 `BlobStore`
  → Page stores the **blob key** (not the fal URL). CSAM-positive **escalates**
  (HITL/NCMEC), not a soft quarantine. (ADR-0007, ADR-0010.)
- **Idempotency:** per-Page **memoized** steps + **deterministic keys** (no
  `uuid`/`Date.now` inside the workflow) + fal idempotency key if available.
- **Failure model:** flip to `draft` at **all-terminal**; new **`failed`**
  Storybook status with a ready-Page floor; **system recovery is free**, parent
  re-roll is budgeted.
- **Gating:** `generate()` requires **active subscription + ready Persona +
  budget** (ADR-0009). **Text-only Character path is free and not sub-gated.**
- **Two-tier consent** (ADR-0016): light jurisdiction-aware notice/attestation
  for Characters; full biometric gate stays on Personas.
- **Classics** are **public-domain catalog only** (ADR-0017); reuse the spine.

### The fake is the behavioral spec — concrete corrections to make it real

`src/services/storybook.ts` is the spec to preserve, but: (1) it stores fal URLs
→ must store **our blob keys** after moderating bytes; (2) it uses
`uuid()`/`Date.now()` → **deterministic keys** inside the workflow; (3) it always
flips to `draft` and always decrements the budget → honor the **`failed`** floor
and the **free-recovery** rule; (4) it does **not** check subscription → must.

## Parked (explicitly out of scope; flagged loud)

- **Social / external auto-publishing** (YouTube channel, Insta/FB reels,
  WhatsApp status) — conflicts with private-by-default sharing (ADR-0013) + adds
  a minor-likeness public-exposure surface. Needs its own safety/privacy design.
- **Voice Personas + family catchphrases** in narration — v2/v3 medium roadmap.

## ⚠️ Environment note (verify before trusting)

The **status line was configured** this session (`~/.claude/statusline-command.sh`
+ `statusLine` in `~/.claude/settings.json`) to show cwd / model / context% /
rate-limit windows. The `statusline-setup` subagent's edit to
`~/.claude/settings.json` also showed `enabledPlugins` + `extraKnownMarketplaces`
(kaizen, skill-creator) — **almost certainly pre-existing** (both appear in the
session skill list), but the user was asked to confirm they installed kaizen
themselves; revert those two keys if not.

## Project rules

See [`AGENTS.md`](../../AGENTS.md). TDD at the service/use-case seam with
providers faked; integration-test RLS isolation, hard-delete propagation
(Postgres **+** blob store), and workflow idempotency / per-Page isolation. Run
the Kaizen Domain Coach after meaningful changes
(`bash tools/kaizen-coach/coach.sh` → act on `KAIZEN-REVIEW-BRIEF.md`).

## Suggested skills for the next session

- **`/tdd`** — red-green-refactor; the intended implementation mode. Start at
  `issues/15-durable-generation-spine.md`.
- **`/improve-codebase-architecture`** — keep new code aligned with the glossary
  + ADRs as the real seams replace the fakes.
- **`/grill-with-docs`** — before the HITL spike (issue 17) or if any open
  question needs resolving against the documented decisions.
