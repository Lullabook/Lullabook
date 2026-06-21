# Moments feed generation as an auto-context layer

Status: accepted (2026-06-13) — **generalized by [ADR-0022](0022-story-context-engine.md)**

> **2026-06-21 note (ADR-0022).** The Moments auto-context layer below is now **one
> input** to the broader **Story Context Engine** (roster, age/Firsts, past-Story
> summary, and photo vision-text join Moments). The contract here — significant always,
> ordinary since-last-Story, watermark advances on success only, never crosses Babies —
> is preserved verbatim as the Moments rule inside the engine.

## Context

PRD v6 adds **Moments** — dated, parent-logged real-life events about a Baby
("first steps today") — whose purpose is to make generated Stories more personal.
The open question was *how* a Moment reaches the generation pipeline. Two
genuinely different shapes were on the table:

1. **Brief input** — the parent hand-picks which Moments to weave in each time
   they create a Story. Moments become another field of the [Brief].
2. **Auto-context layer** — recent Moments are injected into the engineered
   [Prompt] automatically; the parent does nothing extra and every Story silently
   gets more personal.

## Decision

Moments feed generation as an **auto-context layer**, not a Brief input.

When a Story is generated for a Baby, the Prompt builder pulls a context set and
injects it as background material (distinct from the parent-authored Brief). The
context set is:

> **every Significant Moment for the Baby + every ordinary Moment logged since
> that Baby's last Story.**

Significance (the `significant ✨` flag) overrides recency — a flagged Moment
always counts; ordinary Moments age out once a Story has consumed the window.
Moments are scoped to exactly one Baby, so the context set never crosses babies in
a Household.

The **Weekly Story suggestion** is the one place a parent-facing Brief is
*assembled from* Moments (baby + cast + theme pre-filled), but that is a
convenience pre-fill the parent edits and confirms — it does not change the
auto-context contract above, which applies to every Story regardless of origin.

## Why (the trade-off)

- The product promise is "stories that are more personal **without** more work."
  Making Moments a Brief input taxes the parent on every Story and means the
  feature only pays off when they remember to use it. Auto-context makes the
  payoff automatic — the capture habit is the only effort.
- The Brief stays clean: it remains *parent intent* (who stars, what theme), while
  Moments are *lived context*. Keeping them separate avoids overloading the Brief
  and keeps the [Prompt] the single place that fuses intent + context.
- It composes with the existing pipeline: Moments become one more input to the
  Prompt builder, with no change to Scenes, Style Bible, or the durable spine.

## Consequences

- The Prompt builder gains a dependency on the Moment store and must bound the
  context (token budget) — the "since last Story" rule is the natural cap; a hard
  ceiling (newest-N) may be needed if a parent logs prolifically.
- "Since the last Story" requires tracking, per Baby, which Moments a generation
  pass consumed (a watermark), so the window advances correctly.
- Because personalization is invisible, the Reader/Brief should still *show* which
  Moments shaped a Story (provenance) so it doesn't feel like a black box — a
  follow-up, not v1-blocking.
- Moments carry no new biometric data, so this rides the Baby's existing consent
  and the hard-delete/purge path (ADR-0007); no new consent gate is introduced.

[Brief]: ../../CONTEXT.md
[Prompt]: ../../CONTEXT.md
