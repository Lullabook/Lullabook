# Handoff — Lullabook v1

For a fresh agent (target: **Cursor**, TDD) picking up implementation. This doc is
a pointer map, not a re-statement — read the referenced artifacts.

> **Latest session handoff: `SESSION-HANDOFF-2026-06-13.md`** — the native iOS
> effort was switched from a Fable one-shot to the normal workflow (Fable
> unavailable, US restriction). It is now **PRD v3**
> (`planning/prd-v3-native-ios.md`) broken into dependency-ordered, money-first
> **issues `23`–`31`**, to be built by **Cursor Composer 2.5** (TDD). The web
> productionization stays (105 tests). Authorized by **ADR-0018** (native Expo
> rebuild, Apple IAP via RevenueCat, Email-Plus VPC). Start at
> **`issues/23-native-auth-bearer-backend.md`** and follow the `Blocked by` chain;
> issue `31` is HITL and ends by producing `INTEGRATION-FOR-OPUS.md` for **Opus**
> to walk the human through Apple/RevenueCat/App Store Connect.
> `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md` remains the full screen-inventory +
> credential-table reference; `README.md` is the web orientation doc.

## Session handoffs (newest first)

- `SESSION-HANDOFF-2026-06-13.md` — native iOS one-shot → PRD v3 + issues 23–31 (Cursor), grill decisions, glossary updates
- `SESSION-HANDOFF-2026-06-12_2.md` — native iOS planning, code review, ADR-0018, native one-shot prompt
- `SESSION-HANDOFF-2026-06-12.md` — web one-shot COMPLETE: composition root, Inngest functions, actions/routes/webhooks, full UI, glue + new tests
- `SESSION-HANDOFF-2026-06-11_2.md` — productionization one-shot: adapters/migrations done, glue + UI remaining
- `SESSION-HANDOFF-2026-06-11.md`
- `SESSION-HANDOFF-2026-06-10.md`
- `SESSION-HANDOFF-2026-06-09_3.md`
- `SESSION-HANDOFF-2026-06-09_2.md`
- `SESSION-HANDOFF-2026-06-09.md`

## What this project is

Lullabook (provisional name): a **web app** where a parent generates AI
**Storybooks** (illustrated, per-page) starring their own baby and family as
characters, via photo-conditioned **per-persona LoRAs**. Greenfield — **no code
exists yet**; only design/context docs.

## Read these first (all under `CONTEXT/`)

- **Glossary / domain language:** `CONTEXT.md` — the canonical vocabulary
  (Story, Storybook, Page, Brief, Prompt, Persona/Baby/Adult, Family, Member,
  Guardian, Style Bible, Share link, Jurisdiction, Hard-delete, etc.). Use this
  vocabulary everywhere.
- **Stack & runtime choices:** `planning/stack.md`.
- **Decisions (ADRs):** `docs/adr/0001`–`0015` — every load-bearing decision with
  its rationale and trade-offs. **Respect these.**
- **PRD:** `planning/prd-v1.md` — problem, 60 user stories, implementation +
  testing decisions, seams, out-of-scope.
- **Build plan (issues):** `issues/01`–`14` — dependency-ordered vertical
  tracer-bullet slices. **Start at `issues/01-walking-skeleton.md`** and follow
  the `Blocked by` chain.
- **Onboarding & story format:** `planning/onboarding-and-personas.md`,
  `planning/story-format.md`.

## Decision spine (one-liners — full reasoning in the ADRs)

- Web-first + Stripe (ADR-0003). Next.js + Supabase (Postgres+Auth, **RLS**) + R2/S3 for sensitive blobs + durable workflow (Inngest/Trigger.dev) (ADR-0011).
- Claude Sonnet 4.6 story text; fal.ai LoRA train+infer; one structured pass → Story + Scenes + **Style Bible** (ADR-0012); multi-persona via sequential inpaint + ref-model fallback behind a gate (ADR-0005).
- Storybook = curated draft, per-Page re-roll, candidates, `generating→draft→finalized` (ADR-0004).
- Family/Member/**Guardian** model (ADR-0006); Baby Persona = Guardian + payment-VPC (ADR-0008); Adult Persona = self liveness-match (ADR-0014).
- Subscription, Persona-capped, unlimited books (fair-use) (ADR-0009); export-then-purge + always-on hard-delete (ADR-0007).
- Full defense-in-depth child safety (ADR-0010). Private-by-default sharing (ADR-0013).
- Broad Asia+US launch → **jurisdiction-aware consent engine**; "child" is config, not a constant (ADR-0015).

## Key implementation guidance

- **Test at the service/use-case seam with provider adapters faked** (Anthropic,
  fal.ai, moderation, liveness). Integration-test RLS Family-isolation and
  hard-delete propagation. Don't test Inngest/Stripe internals or React render
  details. (See PRD "Testing Decisions".)
- Build provider adapters behind interfaces from slice 01.

## Open / blocking before launch (not before dev)

- **Multi-persona composition spike** (ADR-0005) — quality gate, run early.
- **Child-safety vendors**: CSAM hash-match (e.g. PhotoDNA) + NCMEC reporting
  workflow (ADR-0010, issue 05) — HITL, launch-blocking.
- **Per-market legal sign-off** for each jurisdiction (ADR-0015, ADR-0008).
- **Secrets**: no `.env`/API keys committed; add `.gitignore` before first push.

## Agent fleet (per user)

- **Cursor** → TDD implementation (this handoff's target).
- **Antigravity** → review/coach + parallel slices (run the Kaizen Domain Coach:
  `bash tools/kaizen-coach/coach.sh` → follow `tools/kaizen-coach/COACH.md`).
- **Hermes** → role TBD (user to confirm).

See `AGENTS.md` (repo root) for project rules every agent should load.

## Suggested skills for the next session

- **`/tdd`** — red-green-refactor; the intended implementation mode. Start with
  `issues/01-walking-skeleton.md`.
- **`/improve-codebase-architecture`** — once code exists, to keep it aligned
  with the glossary + ADRs.
- **`/grill-with-docs`** — to resolve any remaining open questions against the
  documented decisions.
