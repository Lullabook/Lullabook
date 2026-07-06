# 0026 — Restore Journal + Learning story type (partial un-cut of the R1 ruthless cut)

- Status: Accepted (2026-07-06)
- Amends: [PRD v16](../../planning/r1-simplify-test-logging-invariants.md) /
  [ADR-0004 lifecycle] — the **"ruthless cut"** principle (a feature not serving the one
  R1 promise is *a way to break*, so it is cut) is **relaxed for exactly two features**:
  the per-Baby **Journal** and the **Learning** [Story Type](../../CONTEXT.md#story-type).
  Everything else PRD v16 cut (**audio**, **multi-family**, **Asia**) stays cut.
- Depends on: the existing flag machinery — `mobile/lib/r1-flags.ts` and
  `src/lib/r1-config.ts` (each cut is **inert, not broken**: a server-side gate + removed
  reachable UI, re-enabled by env, not a rebuild).

## Context

PRD v16 cut the Journal down to **Daily Notes** and shipped **Bedtime only**, on the
principle that surface area is risk. Hands-on QA (2026-07-06, iOS Simulator) surfaced that
the product owner considers both cuts a regression in the felt product: the Create screen
offering a single story type reads as unfinished, and the World home advertises a Journal
("Your baby's Journal — log a moment, see the timeline") that the app cannot actually open.

The load-bearing tension: un-cutting reverses a *documented, deliberate* decision. Per the
ruthless-cut invariant, each restored feature is new surface that can break the one R1
promise (a solo parent makes one illustrated Bedtime story, kept as a PDF). This ADR
records the decision to accept that cost for these two features **and the guardrails that
keep the cost bounded**.

## Decision

**Un-cut the Journal and the Learning story type for the current release. Keep audio,
multi-family, and non-US markets cut.**

1. **Learning story type.** Flip `EXPO_PUBLIC_R1_STORY_TYPES_ENABLED` on so
   `isR1MultiStoryTypeEnabled()` returns the full `ALL_STORY_TYPES` list
   (`mobile/app/(tabs)/create/index.tsx`). The `learning` type already exists end-to-end
   (labels, `storyType` plumbing, `anthropic.generateStory`), so this is a gate flip plus a
   role-correct symbol and a test that both types generate.

2. **Journal.** Flip `EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED` on and restore the reachable
   UI: a per-Baby Journal surface (the [Moment](../../CONTEXT.md#moment) timeline) reachable
   from the World home card and a tab/route, over the existing Moments API. Scope stays
   **solo, one Baby** (multi-family is still cut). The heavy machinery the Journal *can*
   pull in — [Story Context Engine](../../CONTEXT.md#story-context-engine) auto-context
   injection, Firsts, Birthday/weekly suggestions — stays **independently gated**: the
   Journal renders and captures Moments without them.

## Consequences

- **The invariant is relaxed, not abandoned.** Each restored feature ships with its own
  tests and its own entry in the [verify gate](../../CONTEXT.md#verify-gate); a restored
  feature with no passing verification is not "restored," it is a new way to break. The
  cut-flag scaffolding stays in place so either feature can be re-cut by env if it
  destabilizes the core loop.
- **No new consent surface.** Journal Moments ride the Baby's existing consent and the
  Hard-delete/purge path (ADR-0007) — no new gate. Learning stories carry no new data.
  Photos stay write-only (ADR-0020/0021); nothing here renders raw photos.
- **Generation independence preserved.** Restoring the Journal must NOT make story
  generation depend on Moments: `isR1JournalMachineryEnabled()` gates *auto-context
  injection* (`src/services/storybook.ts` `runGenerationBodyInner`), and generation must
  still succeed with zero Moments. This is now an explicit invariant (PRD v19).
- **Symmetric server + client gate.** Both flags must flip together with the mobile mirror
  (`mobile/lib/r1-flags.ts`) and server (`src/lib/r1-config.ts`) so there is never a
  reachable UI whose endpoint is still gated off (the ADR-0004 "inert, not broken" rule,
  run in reverse).
