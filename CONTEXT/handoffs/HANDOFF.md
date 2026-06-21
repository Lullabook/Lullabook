# Handoff — Lullabook v1

For a fresh agent (target: **Cursor**, TDD) picking up implementation. This doc is
a pointer map, not a re-statement — read the referenced artifacts.

> **Latest session handoff: `SESSION-HANDOFF-2026-06-16-mobile-simulator-hitl-bugs.md`** —
> Paid Simulator HITL after PR #26: documents Add Family P0 bugs (FormData upload, selfie
> camera permission), Metro IPv4, OAuth config, and back-title cosmetic. FormData + camera
> fixes on branch `handoff/2026-06-19-live-app-audit-and-native-upload`. Next: re-run HITL
> to close **issue 70**.

## Session handoffs (newest first)

- `SESSION-HANDOFF-2026-06-21-part1-prd-v12-monetization-context-ux.md` — `/part1` PRD v12 (PRIORITY wave, ahead of iOS HITL): 3-tier monetization (Basic/Normal/Plus, trial-as-VPC, no free tier, credits) ADR-0023; Story Context Engine ADR-0022 (supersedes 0019); 5-tab IA + baby-hero Home dashboard; issues 89–99 (build B→A→C); next `/part2` from issue 89
- `SESSION-HANDOFF-2026-06-20-part1-prd-v11-issue70-gate.md` — `/part1` PRD v11 (addendum to v10): iOS-only; one new issue 88 = Add-Family photo-upload verification (Gate 0, blocks 83–87); owed 75–81 passes re-pointed to runbook §1–§5; web live-app-audit deferred; next `/part2` from issue 88
- `SESSION-HANDOFF-2026-06-16-mobile-simulator-hitl-bugs.md` — Simulator HITL bug log (B1–B6): Add Family FormData + selfie errors, Metro/OAuth/back-title; next issue 70
- `SESSION-HANDOFF-2026-06-19-live-app-audit-and-native-upload.md` — live-app-audit skill (hermes orchestration) + xcode-ios-dev skill + mobile FormData helper; next: run audit or issue 83
- `SESSION-HANDOFF-2026-06-18-live-app-run-and-dupe-sweep.md` — ran app on Simulator; fixed expo-router total failure (macOS `* 2` dupes); repo-wide dupe sweep + gitignore guard (PR #38); all session PRs merged; servers still running; next issue 83
- `SESSION-HANDOFF-2026-06-18-part2-issue-82-rerun-verification-gate.md` — `/part2` re-run: added `npm run check:runbook` verification gate for the HITL runbook (sections/commands/paths/ADRs/no-secrets); gate fault-injection-tested; runbook + issue 82 record it; next issue 83
- `SESSION-HANDOFF-2026-06-18-part2-issue-82-hitl-runbook.md` — `/part2` issue 82: HITL smoke runbook foundation (`CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` §0 + §1–§5 scaffold); markdown-only, suite green; red-team fixed non-human-measurable latency step; next issue 83
- `SESSION-HANDOFF-2026-06-18-part1-prd-v10-hitl-smoke.md` — `/part1` PRD v10: full-app HITL smoke verification (local Simulator + dev:paid); runbook + issues 82–87 (GH #29–34); invariants = PASS/FAIL contract; next `/part2` from issue 82
- `SESSION-HANDOFF-2026-06-18-skills-guardrails-and-issue-reconciliation.md` — skill guardrails (`/part1` invariants gate, `/part2` red-team pass, both outside repo); closed GH #18–24 (issues 75–81) as code-complete; HITL Simulator passes still owed
- `SESSION-HANDOFF-2026-06-16-prd-v9-mobile-wave-complete.md` — `/part2` PRD v9 build: issues 75–81 implemented (Journal, Firsts, Storybook Bearer API + generate + reader, stubbed-handler wiring, social-only auth); 225 tests; commit 3e87ed4
- `SESSION-HANDOFF-2026-06-16-prd-v9-mobile-feature-wave.md` — `/part1` PRD v9: mobile parity backbone (wire stubbed handlers + Bearer API), mobile Journal/Firsts, mobile Storybook generate+reader, social-only auth (Apple+Google); payment deferred; issues 74–81 (GH #17–24)
- `SESSION-HANDOFF-2026-06-14-prd-v8-photo-stories.md` — `/part1` PRD v8: photo-to-story (write-only Moment photo, ADR-0021), Firsts view + instant offer, birthday auto-story, lullaby HITL runbook; issues 64–73
- `SESSION-HANDOFF-2026-06-14-issues-58-63.md` — issues 58–62 + 63 runbook: roster avatars, two-mode dev, web polish, mobile parity; 212 tests
- `SESSION-HANDOFF-2026-06-14-issue-57.md` — issue 57: local disk blob-store dev fallback
- `SESSION-HANDOFF-2026-06-14-roster-avatars-and-testflight.md` — `/part1` PRD v7 + ADR-0020 + issues 57–63

- `SESSION-HANDOFF-2026-06-13-issue-50.md` — issue 50: moments DB/service, Daily persistence, Supabase babies+moments sync; 172 tests
- `SESSION-HANDOFF-2026-06-13-maya-world-part2.md` — issues 46–47 + v2 UI (composer, stories shelf, tokenize, edit-character, HTML deliverable); 168 tests
- `SESSION-HANDOFF-2026-06-13-delete-and-ui-polish.md` — delete Character + UI/perf polish (156 tests)
- `SESSION-HANDOFF-2026-06-13-issues-34-44.md` — issues 34–44 DONE: multi-baby, roster, voice, video, v2 UI
- `SESSION-HANDOFF-2026-06-13-local-run-and-bugfixes.md` — local-dev setup + 4 bug fixes (FK-ordered sync, dev moderation, multi-photo upload, auth middleware); revamp queued for `/part1`
- `SESSION-HANDOFF-2026-06-13-skills-push-handoff.md` — `/part1` + `/part2` require mandatory `push-handoff` at end
- `SESSION-HANDOFF-2026-06-13-issue-33.md` — issue 33 DONE: VPC revoke withdraws consent; PRD v4 complete
- `SESSION-HANDOFF-2026-06-13-issue-32.md` — issue 32 DONE: migration 003, Supabase push/VPC persist, CI smoke
- `SESSION-HANDOFF-2026-06-13-native-ios.md` — Cursor BUILT the native iOS app (commit c2750d9, 116 tests); honest follow-ups (screens/migrations)
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
