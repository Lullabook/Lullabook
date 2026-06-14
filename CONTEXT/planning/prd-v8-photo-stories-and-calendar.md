# PRD v8 — Photo Stories, Firsts & Birthday Stories (a feature wave on the Moments loop)

Status: **ready-for-agent** (grilled 2026-06-14). Builds on PRD v5 "Maya's World,"
PRD v6 "Journal & Moments," and the v7 roster-avatar/privacy work. Monetization/paywall
and the TestFlight execution both stay **deferred** (tier-agnostic), consistent with
v5/v6/v7.

Domain language: `CONTEXT/CONTEXT.md` ("Photo-to-story & calendar stories" section —
Moment photo, Firsts, Birthday Story).
Key decision: `CONTEXT/docs/adr/0021-moment-photos-write-only-vision-to-text.md`.
Builds on: ADR-0019 (Moments/auto-context), ADR-0020 (never render raw photos),
ADR-0001/0002/0012 (likeness + Style Bible, **untouched**).

> This wave makes the real-life capture loop richer and more alive. It is a
> **feature** PRD, not infra: four threads that all hang off the existing
> [Moment](../CONTEXT.md)/[Journal](../CONTEXT.md) loop plus the already-shipped
> lullaby weave. Three of the four (Firsts, Photo-to-story, Birthday) funnel through
> the **existing Weekly Story suggestion contract** — an offer the parent confirms,
> never silent background spend. It ships on **web and native iOS**.

## 1. Vision

A parent already logs [Moments](../CONTEXT.md) and gets a weekly story suggestion.
Three things were missing from that loop: they couldn't **point at a real photo**
from today and turn it into a story; the **"firsts"** they care most about were
buried inside the once-a-week card instead of offered the moment they happened; and
the calendar's most personal day — the **baby's birthday** — passed without an
offer. This PRD adds those three, and closes the gap that the **lullaby weave** —
already built (issue 39) — has never actually been run end-to-end by the product
owner. It does all of this without weakening the v7 privacy stance: a real photo can
*seed* a story but is **never shown** and **never drawn from**.

## 2. The model (what's new)

| Term | Meaning |
|---|---|
| **Moment photo** | An optional photo attached to a [Moment](../CONTEXT.md) (the rich-structure pass v6 deferred). **Write-only**: stored Family-scoped, **never rendered on any surface** (extends ADR-0020), retained + hard-deletable (ADR-0007). A vision model reads it into a **scene description** that seeds the [Brief](../CONTEXT.md)/[auto-context layer](../CONTEXT.md); pixels **never** condition art, it **never** trains likeness, and it rides the Baby's existing consent (no new gate). (ADR-0021) |
| **Firsts** | A filtered [Journal](../CONTEXT.md) view of the Baby's milestone/`first` Moments (the `momentType` already in `moment.ts`). Logging a "first" surfaces an **immediate** "Make this a Story" offer inline, distinct from the once-a-week suggestion. |
| **Birthday Story** | A calendar-triggered Story offer fired from a Baby's new **`birthDate`**. Same suggestion contract. Holiday/jurisdiction calendar stories are **deferred**. |

This is a wave **on top of** v6. It does **not** change how Moments are consented,
stored, or auto-injected (ADR-0019), nor how likeness or art are made
(ADR-0001/0002/0012).

## 3. Locked decisions

1. **Spine = feature wave on the Moment/Journal loop + lullaby.** Monetization and
   TestFlight execution stay deferred (tier-agnostic).
2. **Lullaby is not re-modeled.** Issue 39's generation contract shipped. v8 makes
   the **real** record → generate → play flow runnable and ships a **HITL manual
   test script**. No fake voice provider is built.
3. **Photo-to-story = a photo on a Moment**, not a separate create surface. The
   existing create-Story-from-Moment path reads the photo via **vision→text**.
4. **Moment photo is write-only** (never displayed, web or mobile), **retained**
   Family-scoped + hard-deletable, **vision→text only** (pixels never condition the
   illustration), never trains likeness, rides existing consent. (ADR-0021)
5. **Firsts** get a dedicated filtered Journal view **and** an immediate inline
   "Make this a Story" offer on logging a first — distinct from the weekly card.
6. **Birthday Story** adds a `birthDate` field to Baby and offers a story on/near
   it. **Holidays + jurisdiction calendar are out of scope** this wave.
7. **All three auto-story features reuse the existing Weekly Story suggestion
   contract**: offer → parent confirms [Story Type](../CONTEXT.md) → generate.
   **Never silent background spend.**
8. **Real output only — no dev fakes built.** Each feature's definition-of-done
   includes a documented *"run it yourself with real keys"* HITL manual smoke. (The
   automated unit/integration suite still fakes provider adapters at the service
   seam, unchanged.)
9. **Web + native iOS parity.** Finishing the pre-existing **mobile photo-upload
   wiring** is a prerequisite slice for mobile photo-to-story.

## 4. Surfaces

1. **Log a Moment (web + mobile)** — optional "add a photo" affordance. On mobile,
   the phone camera/library. The photo uploads write-only; the Journal shows the
   Moment text (and later the Story), **never the photo**.
2. **Create a Story from a Moment** — when the Moment carries a photo, the pipeline
   first derives a scene description (vision→text) and folds it into the
   Brief/auto-context; generation otherwise proceeds normally (LoRA + Style Bible).
3. **Firsts view** — a filtered Journal timeline of milestone/`first` Moments; an
   inline immediate "Make this a Story" CTA when a first is logged.
4. **Birthday** — Baby gains a `birthDate` (captured at create/edit); on/near it the
   World surfaces a "Make [Baby]'s birthday story" offer.
5. **Reader (lullaby)** — verify the real record → generate → play flow; "Hear
   [name]…" plays the right clip per page, story ends toward the lullaby phrase.
6. **iOS app** — each surface above gets native parity; photo capture wires into the
   same `MomentService`/API.

## 5. The seams

- **`MomentService`** (`src/services/moment.ts`) — the existing Moment seam gains an
  optional photo and a **vision→text adapter** (a new provider interface behind an
  interface, faked in tests like the Anthropic/fal/moderation adapters). It produces
  and stores the scene description; the raw photo is stored under the Family-scoped
  key space and is **never** placed on a `MomentView` or any view object.
- **`StorybookService`** (`src/services/storybook.ts`) — story-from-Moment already
  exists; the photo-derived scene description flows into the same Brief/auto-context
  path that conditions generation.
- **Suggestion/offer service** (extend `JournalNudgeService`,
  `src/services/journal-nudge.ts`) — given a Baby + Moments + `birthDate` + an
  injected clock, returns the **Firsts instant offer** and the **Birthday offer**
  deterministically. Reuses the weekly-suggestion contract; never silent.
- **`BabyService`** (`src/services/baby.ts`) + a migration — Baby gains `birthDate`.
- **Hard-delete** (`src/services/hard-delete.ts`) — extend so a Moment photo is
  purged with the Family (ADR-0007).
- **Lullaby** — no new seam; an HITL manual test runbook only.

## 6. Out of scope / deferred

- **No monetization / paywall** decisions (still deferred).
- **No TestFlight execution** (the v7 issue-63 runbook remains human-run).
- **No holiday / jurisdiction calendar** — birthday only this wave.
- **Photo never conditions the illustration** and **never trains likeness**
  (ADR-0021); no visual-conditioning / img2img spike.
- **Mood attachments** and other v6 rich-structure items beyond the photo are not
  in this wave.
- **No voice cloning** (ADR holds); lullaby uses recorded clips only.

## 7. Slice order (issues)

`64` Baby `birthDate` + migration (cheapest, unblocks birthday) → `65` vision→text
adapter + Moment photo write-only on `MomentService` (the spine; ADR-0021) → `66`
photo-derived scene description into story-from-Moment generation → `67` Firsts view
+ instant "Make this a Story" offer → `68` Birthday Story offer (needs 64) → `69`
extend hard-delete to purge Moment photos → `70` mobile photo-upload wiring
(prerequisite) + native parity for photo-to-story → `71` native parity for Firsts +
Birthday offers → `72` lullaby real-path HITL manual test runbook (record → generate
→ play).

65 is the spine (write-only photo + vision adapter); 66 makes it produce a story; 64
unblocks 68. 69 keeps the privacy/lifecycle invariant honest. 70–71 carry the wave to
iOS. 72 is independent and can land anytime.
