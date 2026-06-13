# PRD v5 — "Maya's World" Revamp

Status: **planning** (grilled 2026-06-13). Supersedes the bedtime-storybook framing
of PRD v1–v4 where they conflict. Monetization/paywall gating is **deliberately
deferred** (build features tier-agnostic; decide the gate after the code exists).

Design source: Claude Design v2 (`Lullabook Redesign v2.dc.html`), ported live to
`/world` (`src/app/world/page.tsx`, mock data). Pricing/limits research:
`CONTEXT/planning/pricing-and-features-2026-06-13.md`.

## 1. Vision

Lullabook is **a living world starring the baby**, populated by the real people who
love them — not a bedtime app. The baby is the protagonist; family members appear as
themselves (their look *and their real voice*); made-up characters fill out the world.
Stories span any moment (everyday, milestone, adventure, lesson, bedtime, silly), and
the premium emotional hook is **hearing a real family member read/sing to the baby**,
including a story that ends in a recorded lullaby.

## 2. Domain model (the big change)

| Term | Meaning | Was |
|---|---|---|
| **Household** | The account / billing / consent boundary. One or more grown-ups. | "Family" in ADR-0006 |
| **Baby** | A starring child. A Household has **one or more**. | "Baby Persona" |
| **World** | A baby's home surface — everything centered on that baby. One World per Baby. | (new) |
| **Family** (roster) | The real people who love a Baby — each with a **relationship**, **what they call the baby** + **what the baby calls them**, **photos** (likeness), and **recorded voice clips**. Shared across a Household's babies by default. | "Persona" |
| **Character** | Purely **made-up/fictional** friends (dragon, talking cat). No photos/voice. Free. | "Character" (real-or-fictional) |
| **Voice clip** | A real recorded audio line from a Family member (greeting, "I love you", a lullaby), woven into stories. | (new) |
| **Video page** | Premium: a page's illustration animated into a ~5-sec clip with that page's narration over it. | (new) |

**Multi-baby rule (keep simple, not perfect):** a Household can add multiple babies.
The Family roster is **shared by default** (siblings share the same family). When
adding a baby, the user may indicate the baby belongs to a **different family**, in
which case that baby gets its own roster. Relationships + nicknames are **per
baby–person pair** (Grandma calls baby A "moonbeam", baby B "sweetpea").

**Naming collision resolved:** the old `Family`=account becomes `Household`; `Family`
now means the roster of loved ones; `Persona` is retired in user-facing language
(the likeness model still exists internally per ADR-0001/0002, now attached to a
Family member). `Member`/`Guardian` (logins) stay but are de-emphasized in UI.

## 3. Surfaces (from the v2 design)

1. **World (home)** — the baby centered as hero; a ring of everyone in their world
   (family + characters); recent stories; "Start a new story". Per-baby; switch baby.
2. **Stories** — shelf of storybooks, continue-reading hero, status filters, Classics.
3. **Family** — master-detail: list + rich detail (relationship, both nicknames,
   photo gallery, **"Their real voice"** record/playback panel), "Cast in a story".
4. **Characters** — grid of made-up friends, invent from traits (free).
5. **Create** — theme, cast picker (family + characters; baby always stars), 6 story
   types, art style, length; live brief preview.
6. **Reader** — page spread (illustration/video + text), **"Hear [name] read this
   page"** voice playback, re-roll text/art, page dots, share/export.

Design system: cream `#FBF4E7` paper, Baloo 2 + Nunito, lavender `#8B6DF0`/`#6A55C9`
+ amber `#E79A3C`, rounded, soft shadows, twilight gradients for hero/immersive.

## 4. Audio (recorded-voice, v1 — no cloning)

- Per Family member: record short clips in-app (label, transcript, waveform).
- Clips attach to story slots: a **story hello**, in-page lines, and a **lullaby
  ending** — the generation contract writes the narrative *toward* the recorded
  phrase so it lands cohesively (e.g. story climaxes into Grandma's recorded lullaby).
- Reader plays the relevant member's clip per page ("Hear Nani read this page").
- Voice = biometric → explicit **voice-consent** capture per person + revoke (extends
  the consent engine; ADR-0010/0015 family).

## 5. Video (v1 — short per-page clips)

- Premium "video story": each page's illustration animated into a **~5-second clip**
  (image-to-video) in the chosen art style, with that page's narration over it.
- Short books for video (≈5–8 pages × 5s), comic/animated feel — **not** 16-page
  long-form. Provider/cost under research (fal.ai image-to-video models).
- Pipeline reuses the durable generation spine (ADR-0011) as an extra per-page step
  after illustration; idempotent per page/attempt (money-safety, issue 16).

## 6. Monetization — DEFERRED

Build all features tier-agnostic. The paywall gate (what's free vs paid) and usage
caps are decided **after** the code exists. Research parked in
`pricing-and-features-2026-06-13.md`: lean = free illustrated short stories as the
hook; premium = narration + real-voice + video + length; monthly usage caps over
weekly; Founding-Family launch offer; per-region Asia pricing. **Not locked.**

## 7. Out of scope (this revamp)

- Voice cloning (later premium).
- Long-form video.
- Final paywall/pricing (deferred by decision).
- Re-litigating child-safety/consent infra (reused, extended for voice).

## 8. Open decisions still to grill before/while building

- Voice-consent UX + retention/revoke semantics for recorded clips.
- Exact lullaby-weave generation contract (how the prompt guarantees the recorded
  phrase lands as the ending).
- Video provider + per-clip budget (pending research) and the durable-step shape.
- Per-baby vs shared art/Style-Bible defaults across siblings.
