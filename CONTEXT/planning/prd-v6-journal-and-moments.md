# PRD v6 — Journal & Moments (daily capture → personalized stories)

Status: **planning** (grilled 2026-06-13). Builds on PRD v5 "Maya's World"
(Baby/World/Family-roster language). Monetization/paywall gating is **deferred**,
consistent with v5 — build the feature tier-agnostic and decide the gate later.

Domain language: `CONTEXT/CONTEXT.md` ("Journal & Moments" section).
Key decision: `CONTEXT/docs/adr/0019-moments-auto-context-personalization.md`.

> **Build scope note:** this PRD is the *feature* spec only. The visual design is
> being produced separately (Claude Design v2 → `/world`); these issues build the
> data model, capture/scheduling flow, and the generation wiring against the
> existing design system, and must **not** re-do or block on visual design work.
> Part-2 implementation is handed to Cursor's Composer.

## 1. Vision

The baby's real life is the best source of personal stories. **Journal & Moments**
lets a parent capture what actually happened — "first steps," "met the puppy,"
"meltdown at the zoo" — as lightweight **Moments**, and those Moments quietly make
every generated Story more about *this* baby. A daily nudge builds the habit; a
weekly suggestion turns the week into a storybook in one tap. No extra work at
story time: the capture is the effort, the personalization is automatic.

## 2. The model (what's new)

| Term | Meaning |
|---|---|
| **Moment** | A dated, parent-logged event about one **Baby**. v1 = free text + date + optional **linked people** (Family/Characters present) + a **`significant ✨`** flag. Photo/mood deferred to a later rich-structure pass. |
| **Significant Moment** | A Moment with the `significant` flag set. Always reaches generation (recency-independent); pins to the Journal. |
| **Journal** | A per-Baby surface in the World holding the Moment timeline + a **weekly spread** ("day in the life"). One per Baby. |
| **Auto-context layer** | Recent Moments auto-injected into the **Prompt** as background context — not a Brief input. Contract: all Significant Moments + ordinary Moments **since this Baby's last Story**. (ADR-0019) |
| **Daily nudge** | A once-a-day "What happened today?" card on the World home; native iOS also fires push (issue 30). Capture stays free-form — the nudge never forces a schedule. |
| **Weekly Story suggestion** | A weekly "Make [Baby]'s week into a story" offer that pre-fills a **suggested Brief** (baby stars; cast = people linked that week; theme from Significant Moments); parent picks Story Type and **confirms before any spend**. |

**Scoping rules.** A Moment belongs to exactly one Baby (one World); nothing
crosses babies in a Household. Linked people reference existing Family-roster
members and Characters — logging never creates them. Moments carry no new
biometric data, so they ride the Baby's existing consent and the
hard-delete/purge path (ADR-0007); no new consent gate.

## 3. Surfaces

1. **Journal (new, per-Baby tab in the World)** — reverse-chronological timeline of
   Moments; a **weekly spread** view (the daily-spread "day in the life" layout);
   Significant Moments visually pinned. Empty state invites the first Moment.
2. **Capture (Add a Moment)** — quick entry: text, date (defaults today), optional
   "who was there" people picker (Family + Characters), the `significant ✨` toggle.
   Reachable from the daily nudge card and from the Journal.
3. **World home** — gains the **Daily nudge** card ("What happened today?") and, once
   a week with enough Moments, the **Weekly Story suggestion** card.
4. **Create / Brief** — unchanged in shape, but every generation now silently
   consumes the **auto-context layer**. The Weekly Story suggestion deep-links into
   Create with the suggested Brief pre-filled (parent edits + confirms).
5. **Reader (follow-up, not v1-blocking)** — optionally shows which Moments shaped a
   Story (provenance), so auto-context isn't a black box.

## 4. Capture & scheduling

- **Free-form first:** a Moment can be logged anytime; there is no mandatory schedule.
- **Daily nudge:** one capture card per day on World home; native push reminder via
  the existing infra (issue 30). Web = in-app card only in v1.
- **Weekly spread:** the Journal renders the current week as a daily spread; past
  weeks scrollable. This is the "weekly schedule / daily spread" the user asked for —
  a *view + habit*, not forced data entry.
- **Weekly Story suggestion:** once per week, if the Baby has ≥ a threshold of
  Moments (and/or ≥1 Significant Moment), offer the one-tap weekly story. Pre-fills
  the Brief; parent confirms before any generation spend (no silent background spend).

## 5. Personalization wiring (the heart)

- The **Prompt builder** gains a Moment dependency. On every Story generation for a
  Baby it pulls the **auto-context set** (ADR-0019: significant + since-last-Story),
  renders it as background context, and injects it alongside the Brief.
- A per-Baby **watermark** records which Moments a generation pass consumed so the
  "since last Story" window advances and ordinary Moments age out.
- **Bounding:** the since-last-Story rule is the natural cap; add a hard newest-N
  ceiling + token budget so a prolific logger can't bloat the Prompt.
- The Weekly Story suggestion is the only place Moments assemble a *parent-facing*
  Brief; the auto-context contract still applies to every Story regardless of origin.

## 6. Out of scope (this PRD)

- **Rich Moment structure** — mood, photo attachments (photo of a minor = consent
  surface; consistent with deferred-design). v1 is text + people + flag.
- **Fully automatic background story generation** — weekly story is suggestion +
  one-tap only; no silent spend.
- **Milestone taxonomy / importance scoring** — significance is a single boolean.
- **Voice/video on Moments** — separate tracks (PRD v5 voice/video).
- **Final paywall/pricing** — deferred by decision (tier-agnostic build).

## 7. Open decisions to grill before/while building

- Weekly-story trigger threshold (how many Moments / require a Significant one?).
- Hard ceiling + token budget for the auto-context set (newest-N cap value).
- Watermark semantics on a **failed** generation (did it "consume" the window?) —
  lean: only a Story that reaches text consumes Moments.
- Whether ordinary Moments older than the window are *gone* for good vs surfaced as
  optional Brief picks (leaning gone, to keep ADR-0019 simple).
- Native push scheduling/quiet-hours for the daily nudge.
