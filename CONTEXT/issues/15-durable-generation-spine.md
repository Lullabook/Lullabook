# 15 — Durable generation spine (single-Persona, real seams)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0011, ADR-0012, ADR-0004, ADR-0007, ADR-0010, ADR-0009
- Glossary: Story Type, Style Bible, Storybook (`generating → (draft | failed)`)

## What to build

Replace the in-memory faked happy path of single-Persona Storybook generation
with the real durable-workflow architecture, end-to-end behind the existing
provider seams. A subscribed parent submits a Brief (one ready Persona + Story
Type + theme + optional note); the request validates, runs the child-safety text
check, gates on **active subscription + ready Persona + re-roll budget**, creates
the Storybook `generating`, enqueues a durable workflow, and returns immediately.

The workflow runs one structured Claude pass (`claude-sonnet-4-6`) → Story text +
per-Page Scenes + Style Bible, **persisted to Postgres** so fan-out steps read
persisted state, not an in-process variable. It fans out per Page: sync-await
fal.ai inference (`Style Bible + Scene + Persona LoRA`), then — in strict order —
fetch bytes → **moderate the bytes before any persist** → on pass store into the
R2 `BlobStore` under a Family-scoped key → the Page records the **blob key** (not
the fal URL). The book flips `generating → draft` once every Page is terminal;
a failed/quarantined Page is a re-rollable hole, not a blocker. `Storybook.status`
gains `failed` for the no-Story / below-floor cases.

## Acceptance criteria

- [ ] Submitting a Brief returns a `generating` Storybook immediately; generation continues in the workflow body after the request returns.
- [ ] The structured Claude pass yields Story + Scenes + Style Bible in one pass, persisted to Postgres before fan-out reads them.
- [ ] Each Page's image Prompt incorporates the Style Bible (consistency).
- [ ] Each generated image is moderated **before** it is stored; a moderation failure means `BlobStore.put` is never called for that Page (only an audit record).
- [ ] A Page stores the app's **blob key** (R2/S3), never the fal-hosted URL.
- [ ] The book flips to `draft` once every Page is terminal (`ready | quarantined | failed`); one faked image failure quarantines that Page while the rest complete.
- [ ] Generation is rejected when the subscription is inactive; accepted with an active subscription + ready Persona + budget.
- [ ] The Brief carries a `storyType` (`bedtime | learning`) that branches the generation pass.
- [ ] `StorybookService` generation tested at the service seam with Anthropic, fal.ai, moderation, blob store, and workflow faked; integration-test hard-delete removes the Page blobs from the `BlobStore`, not just rows.

## Blocked by

None — can start immediately (builds on the slice-06 in-memory behavior).
