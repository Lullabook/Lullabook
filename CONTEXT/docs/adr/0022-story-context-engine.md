# 0022 — Story Context Engine (generalizes the auto-context layer)

- Status: Accepted (2026-06-21)
- Supersedes: [ADR-0019](0019-moments-auto-context-personalization.md) (Moments-only
  auto-context) — generalizes it; the ADR-0019 contract becomes one input among many.
- Depends on: [ADR-0011](0011-backend-architecture.md) (Prompt builder / durable spine),
  [ADR-0021](0021-moment-photos-write-only-vision-to-text.md) (write-only vision→text).

## Context

ADR-0019 made **Moments** an auto-context layer injected into the generation Prompt.
The product now wants generation to draw on **the whole picture a Household has
already given us** — not just Moments — so every Story is as personal as the data
allows, with no extra work from the parent. The open question was *how* the engine
decides what the model needs: deterministic rules, a per-Story LLM ranking pass, or
embeddings/RAG retrieval.

## Decision

Introduce a **Story Context Engine**: a deterministic, rule-based selector that
assembles a bounded **story context set** for a Baby and hands it to the Prompt
builder as background material, distinct from the parent-authored Brief.

**Inputs (sources):**
- **Significant Moments** — always included (the `significant ✨` flag overrides
  recency), per ADR-0019.
- **Ordinary Moments** — only those logged **since that Baby's last Story** (the
  ADR-0019 watermark).
- **Roster cast** — the Family members in the Brief + their relationship/nicknames.
- **Age / Firsts** — the Baby's birthdate-derived age and logged Firsts/milestones.
- **Past-Story summary** — a short rolling summary of recent finalized Stories, for
  **continuity and anti-repeat** (don't retell the same plot).
- **Moment-photo vision-text** — the write-only text descriptions of linked photos
  (ADR-0021); **never the raw image**.

**Selection rules:** significant Moments always; ordinary only since last Story; cast
from the Brief/roster; age/firsts and past-story summary always included if present.

**Bounding:** a hard **newest-N ceiling** + a **token budget** (≈2000 context tokens).
When trimming, ordinary Moments drop before significant ones; the past-story summary
and cast are protected.

**Watermark:** only a generation that **reaches Story text** advances the per-Baby
watermark; a failed pass does not (preserves ADR-0019).

**No extra LLM call** — assembly is DB reads + concatenation, so it adds negligible
latency and cost and is fully unit-testable. A clean seam is left so a later **LLM
ranking pass** (v2) can replace the rule-based selector without changing the Prompt
builder contract.

## Why (the trade-off)

- **Deterministic beats clever, for v1.** A rule-based selector is cheap (no per-Story
  LLM cost), fast (<200ms), and testable against an explicit contract — the things an
  LLM pre-pass and a RAG pipeline both sacrifice. At current per-Family data volume,
  embeddings are overkill (new vector-DB infra for tens-of-rows retrieval).
- **It composes with the existing pipeline** exactly as ADR-0019 did — one more Prompt
  input, no change to Scenes, Style Bible, or the durable spine.
- **It scales the personalization promise** ("more personal without more work") beyond
  Moments to everything we already know, which is the product's core differentiator.

## Consequences

- The Prompt builder gains dependencies on the roster, Firsts, birthdate, past-Story
  summary, and photo vision-text stores — all **Family-scoped (RLS)**; the context set
  **never crosses Babies** in a Household (ADR-0019 invariant preserved).
- A per-Baby **past-Story summary** must be produced and stored on finalization (a
  small, bounded artifact) so continuity/anti-repeat has an input.
- Because personalization is invisible, the Reader should still **show which inputs
  shaped a Story** (provenance) so it doesn't feel like a black box — a follow-up.
- No new biometric data enters generation (vision-text only), so this rides the Baby's
  existing consent and the hard-delete/purge path (ADR-0007).

## Considered Options

- **LLM pre-pass ranking** — a cheap call selects the most story-worthy facts per
  Story. Smarter, but adds cost + latency per Story and is nondeterministic (hard to
  test/budget). Deferred to a v2 behind the seam.
- **Embeddings / RAG** — vector-store all Household data, retrieve top-K. Scales to
  huge histories but needs new infra; premature at current data size. Rejected for v1.
