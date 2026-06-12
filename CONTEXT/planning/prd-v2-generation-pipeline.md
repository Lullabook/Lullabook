# PRD v2 — Productionized generation pipeline + Character (free text) tier + Personalized Classics

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](./prd-v1.md)
- Refs (ADRs): [0002](../docs/adr/0002-per-persona-lora.md),
  [0004](../docs/adr/0004-curated-versioned-storybook.md),
  [0005](../docs/adr/0005-multi-persona-scenes-in-v1.md),
  [0007](../docs/adr/0007-data-lifecycle-and-deletion.md),
  [0008](../docs/adr/0008-verifiable-parental-consent.md),
  [0009](../docs/adr/0009-subscription-monetization.md),
  [0010](../docs/adr/0010-child-safety-defense-in-depth.md),
  [0011](../docs/adr/0011-backend-architecture.md),
  [0012](../docs/adr/0012-illustration-pipeline-style-bible.md),
  [0015](../docs/adr/0015-multi-jurisdiction-launch.md),
  [0016](../docs/adr/0016-character-tier-two-tier-consent.md),
  [0017](../docs/adr/0017-personalized-classics-public-domain.md)
- Glossary terms: Story Type, Character, Trait Questionnaire, Personalized
  Classic, Storybook (`generating → (draft | failed)`).

## Problem Statement

The v1 build is a complete in-memory tracer-bullet: all 14 slices pass at the
service seam with every external provider faked. Nothing yet talks to real
infrastructure. In particular, the **generation pipeline** — the product's core
act, where a parent turns a Brief into an illustrated Storybook — runs entirely
synchronously in `StorybookService.generate()` against fakes. A real run calls
Claude once and fal.ai a dozen times (minutes of paid, independently-failing
work); it cannot live inside one HTTP request, cannot lose money to retries, and
cannot let a single bad Page sink an entire book. Until this path is real, there
is no product.

Two product gaps also surfaced during design: (a) every Story today requires a
photo-anchored **Persona** (the full biometric-consent gate + paid LoRA),
leaving no low-friction entry point; and (b) parents want recognizable tales
("*Alice*, but starring grandma"), which the from-scratch generate path does not
offer.

## Solution

Productionize the generation pipeline as a **durable workflow** (ADR-0011): the
request creates a `generating` Storybook and enqueues; everything expensive runs
in retryable, per-Page-isolated steps behind the existing provider seams. A
single structured Claude pass yields Story + Scenes + **Style Bible** (ADR-0012);
fan-out generates each Page's illustration via fal.ai; each illustration is
moderated **before** it is ever stored, then persisted into our own encrypted
blob store so hard-delete and consent stay provable (ADR-0007, ADR-0010). Failed
or quarantined Pages become re-rollable holes rather than blockers (ADR-0004).

Add a **free, text-only tier**: parents build a **Character** via a **Trait
Questionnaire** (no photos, no LoRA, no biometric) and generate text Stories at
no cost, behind a light jurisdiction-aware consent notice (ADR-0016). Add
**Personalized Classics**: a curated public-domain catalog, recast with the
family's Personas, reusing the same illustrated pipeline (ADR-0017).

## User Stories

### Productionized illustrated generation (slice 06 → real)

1. As a subscribed parent, I want to submit a Brief and immediately get back a
   Storybook in `generating` state, so that the UI can show progress without my
   request hanging for minutes.
2. As a parent, I want the heavy generation to continue server-side after my
   request returns, so that closing the tab does not abort my book.
3. As a parent, I want my Storybook's text, Scenes, and Style Bible produced in a
   single coherent pass, so that the book reads as one work, not twelve unrelated
   images (ADR-0012).
4. As a parent, I want each Page's illustration to respect the book's Style
   Bible, so that wardrobe, palette, and art style stay consistent page to page.
5. As a parent, I want one Page's failed illustration to leave the rest of the
   book intact, so that a transient provider hiccup doesn't waste my whole
   generation.
6. As a parent, I want a Page that failed generation to appear as a re-rollable
   hole I can retry for free, so that I'm not charged for the system's fault.
7. As a parent, I want to spend my re-roll budget only when *I* choose a
   different result, so that recovery from failures never costs me re-rolls
   (ADR-0004).
8. As a parent, I want my Storybook to reach `draft` as soon as every Page is
   resolved, so that I can start curating without waiting on one stubborn Page.
9. As a parent, I want to be told clearly when a book `failed` (no Story, or too
   few Pages succeeded), so that I'm never handed a mostly-broken draft.
10. As a parent, I want illustrations of my child stored only in the app's own
    encrypted storage, so that I can trust hard-delete actually erases them
    (ADR-0007).
11. As a parent, I want every generated illustration moderated before it is
    stored or shown, so that no unsafe image of my child is ever persisted
    (ADR-0010).
12. As the platform, I want a CSAM-positive on a generated image to escalate to
    the human-in-the-loop / NCMEC path, not a silent Page quarantine, so that
    legal obligations are met (ADR-0010, issue 05).
13. As the platform, I want each fal.ai inference billed at most once per Page
    per attempt despite workflow retries, so that replays don't burn money.
14. As the platform, I want a workflow retry to overwrite the same blob key and
    upsert the same Page row, so that retries never duplicate Pages or orphan
    blobs.
15. As a parent, I want generation blocked unless my subscription is active, so
    that the paid boundary is enforced consistently (ADR-0009); on lapse I get
    export-then-purge, not silent new generation (ADR-0007).
16. As a parent generating a multi-Persona Page, I want the sequential-inpaint
    (or ref-model fallback) path used behind the existing gate, so that baby +
    grandparent appear together coherently (ADR-0005).
17. As a parent, I want to choose a **Story Type** (Bedtime or Learning) per
    book, so that the narrative arc fits my intent (calming wind-down vs an
    embedded lesson/numbers).

### Free text-only Character tier

18. As a new parent, I want to create a **Character** by answering a short
    **Trait Questionnaire** (name, nickname, relationships, favorite
    animals/toys, songs, topics), so that I can star my family without uploading
    any photos.
19. As a parent, I want to generate **text-only** Stories from my Characters for
    free, so that I can try the product with zero cost and zero photo friction.
20. As a parent, I want to pick a Story Type for a text Story too, so that
    bedtime vs learning works without illustrations.
21. As a parent in a stricter jurisdiction, I want the consent step for a
    real-child Character to escalate automatically, so that the free tier stays
    legal in my market without the app changing (ADR-0015, ADR-0016).
22. As a privacy-conscious parent, I want to create a fully fictional Character,
    so that I can use the product with no real-child data at all.
23. As a parent, I want a recorded notice + single guardian attestation when I
    enter a real child's traits, so that the free tier is lawful yet near
    frictionless (ADR-0016).
24. As a parent who started free, I want to promote a Character into a Persona by
    adding photos later, so that I can upgrade to illustrated Storybooks without
    re-entering everything (ADR-0016).
25. As the platform, I want Characters to carry no biometric and require no LoRA,
    so that the heavy gate (verifiable consent, liveness, CSAM) stays bound only
    to Persona creation.

### Personalized Classics

26. As a parent, I want to pick a beloved classic from a curated catalog and have
    my Personas recast as its characters, so that my child hears a familiar story
    starring their own family.
27. As a parent, I want a Personalized Classic to be illustrated with the same
    consistency (Style Bible) and quality as an original Storybook, so that it's
    a keepsake too.
28. As a parent, I want any custom twist I add to a classic moderated like a
    Brief, so that the safety rails are identical (ADR-0010).
29. As the platform, I want classics restricted to confirmed public-domain
    source tales, so that copyright exposure is capped to a reviewed catalog
    (ADR-0017).
30. As a parent, I want a Personalized Classic to honor my chosen Story Type
    where it makes sense, so that a classic can be told as a bedtime or learning
    variant.

## Implementation Decisions

### Generation pipeline (productionize `StorybookService`)

- **Thin request, fat workflow (ADR-0011).** A new `enqueueGeneration` entry
  validates the Brief, runs the child-safety text check on any note, gates on
  **active subscription + ready Persona(s) + re-roll budget**, creates the
  Storybook row `status=generating`, and enqueues a durable workflow. It returns
  the `generating` book immediately. `StorybookService.generate()` becomes the
  **workflow body**, invoked by the `WorkflowAdapter`, not by the HTTP handler.
- **One structured Claude pass, persisted across the step boundary.** Step 1
  calls `AnthropicAdapter.generateStory(...)` (model `claude-sonnet-4-6`) →
  Story text + per-Page Scenes + Style Bible, and **writes them to Postgres**
  (the Storybook's `styleBible`, the Pages' text, the Scene specs) so later
  fan-out steps read persisted state rather than an in-process variable. The fake
  holds these in a local; the real path must not.
- **Fan-out, sync-await fal inference.** Each Page is generated by a fal.ai call
  awaited synchronously inside its step (bounded latency; the durable step is the
  retry boundary). **Training stays webhook + `waitForEvent`** (ADR-0002, slice
  04) — only *inference* is sync here. Per-Page Prompt = `Style Bible + Scene +
  Persona LoRA(s)` (ADR-0012). Multi-Persona Pages use sequential-inpaint with
  ref-model fallback behind the existing `useReferenceModelForMulti` gate
  (ADR-0005).
- **Per-Page memoized steps + deterministic keys.** Each Page is split into
  discrete memoized workflow steps (`fal-gen-{idx}` → `moderate-{idx}` →
  `store-{idx}` → `persist-{idx}`); a successful step is never re-executed on
  replay. **All identifiers inside the workflow are derived deterministically**
  from `{storybookId}/{pageIndex}` (+ an attempt counter for re-rolls) — no
  `uuid()` / `Date.now()` in the workflow (the fake's random keys break replay
  idempotency). A deterministic fal **idempotency key** is passed if the fal API
  accepts one; otherwise rare double-spend is accepted (no reconciliation ledger
  in v1).
- **Image persistence + moderation order (ADR-0007, ADR-0010).** Per Page, in
  order: fal returns an ephemeral URL → **fetch bytes** → `ModerationAdapter`
  checks the **bytes** (incl. CSAM hash-match) **before any persist** → on pass,
  `BlobStore.put(key, bytes)` into R2/S3 under a Family-scoped prefix (e.g.
  `families/{familyId}/storybooks/{bookId}/pages/{idx}/{deterministicId}.png`) →
  the Page stores the **blob key** (a signed-URL resolver serves it). On
  moderation fail: **never persist the bytes**, write only an audit record. The
  fake stores the raw fal URL and moderates a URL — both change.
- **CSAM escalation.** A CSAM-positive on a generated image routes into the same
  child-safety escalation as the upload path (HITL / NCMEC, issue 05), not a soft
  Page quarantine.
- **Terminal states + `failed` book.** A Page is terminal as `ready`,
  `quarantined`, or `failed` (after step retries exhausted). The Storybook flips
  `generating → draft` once **every** Page is terminal; failed/quarantined Pages
  render as re-rollable holes (ADR-0004). It flips `generating → failed` if the
  Claude pass produced no Story, or fewer than a **configurable ready-Page
  floor** succeeded. `Storybook.status` gains `failed`.
- **Re-roll cost split.** System-caused recovery regeneration (a failed/
  quarantined Page) is **free**; only a parent-initiated re-roll decrements the
  budget/credits. The fake decrements on every re-roll — this changes.
- **Story Type.** The Brief gains a `storyType` (`bedtime | learning`); the
  structured Claude pass branches its instruction set on it.

### Free text-only Character tier (ADR-0016)

- **New `CharacterService.create(memberId, questionnaire)`**, mirroring
  `PersonaService` but with **no photo/LoRA/biometric**. It runs the **light**
  consent checkpoint: a jurisdiction-aware notice + single guardian attestation
  (consent engine, ADR-0015), recorded as a lightweight Consent receipt variant
  (ADR-0008). Fully-fictional Characters skip even that.
- **New `TextStoryService.generate(memberId, brief)`** for the free path: a
  single `AnthropicAdapter` text pass from Character traits + Story Type. **No**
  fal.ai, **no** Style Bible, **no** BlobStore, **no** durable fan-out (text is
  one cheap call). Not gated on subscription; gated on a valid Character.
- **Character → Persona upgrade.** Attaching photos to a Character promotes it
  into a Persona, entering the full gate; the Character's traits carry forward.

### Personalized Classics (ADR-0017)

- **New `StorybookService.generateFromClassic(memberId, classicId, brief)`**
  reusing the same workflow body and all pipeline mechanics above. Only the
  Claude contract differs: an `AnthropicAdapter.adaptStory(...)` that recasts a
  catalog source tale's beats onto the starring Personas, honoring Story Type.
- **New `ClassicCatalog` port** returning curated **public-domain** source tales
  only. Custom twists pass the Brief moderation rails (ADR-0010).

### Cross-cutting

- All new external dependencies (fal idempotency, R2 `BlobStore`, durable
  `WorkflowAdapter`, `ClassicCatalog`) sit behind **adapter interfaces** so tests
  fake them (existing project rule).
- Per-Family **RLS** remains the isolation mechanism for all new rows
  (Characters, Classic selections); blob keys are Family-scoped for hard-delete.

## Testing Decisions

- **Test external behavior at the service/use-case seam, not implementation.**
  Continue the existing pattern: drive `StorybookService` / `TextStoryService` /
  `CharacterService` with Anthropic, fal.ai, moderation, blob store, and workflow
  **faked**; assert on observable outcomes (book status, Page states, blob puts,
  bill counts), not internal calls. Do not test the durable platform's internals,
  Stripe internals, or React render details (PRD v1 Testing Decisions).
- **Workflow idempotency / replay.** Use a fake `WorkflowAdapter` that can
  **re-invoke a step** to simulate at-least-once replay. Assert: fal called at
  most once per Page per attempt, the blob key is stable across replays, and the
  Page row upserts (no duplicate Pages).
- **Per-Page isolation.** With one faked fal failure, assert the offending Page
  is `failed`/`quarantined` while the rest of the book completes and the book
  still reaches `draft` (extends the existing slice-06 isolation test).
- **Moderation-before-store.** With a faked moderation rejection, assert
  `BlobStore.put` is **never** called for that Page and only an audit record is
  written. With a faked CSAM-positive, assert the escalation path fires (not a
  soft quarantine).
- **Failure floor.** With the faked Claude pass failing, assert `status=failed`
  and no Pages persisted. With too few ready Pages, assert `status=failed`.
- **Re-roll cost.** Assert system recovery regeneration does not decrement the
  budget; a parent re-roll does.
- **Subscription gate.** Assert generation is rejected when the subscription is
  inactive, accepted when active with a ready Persona and budget.
- **Character / text tier.** Assert a Character can be created with no photos;
  the light consent checkpoint records a receipt for a real-child Character and
  is skipped for a fictional one; jurisdiction config can escalate it (faked
  jurisdiction). Assert `TextStoryService.generate` produces a text Story with no
  fal/blob calls and without a subscription.
- **Classics.** Assert `generateFromClassic` only accepts catalog (public-domain)
  ids, reuses the workflow body, and routes custom twists through Brief
  moderation.
- **Integration tests (real-ish):** RLS Family-isolation on the new rows;
  hard-delete propagation across Postgres **and** the R2 `BlobStore` (blobs gone,
  not just rows); workflow idempotency + per-Page isolation end-to-end.
- **Prior art:** `tests/06-generate-storybook.test.ts` (generation + isolation),
  `tests/05-child-safety.test.ts` (moderation), `tests/12-hard-delete.test.ts`
  (cross-store delete), `tests/01-walking-skeleton.test.ts` (RLS),
  `tests/adapters.test.ts` (fakes), `tests/03-adult-persona.test.ts`
  (consent/liveness pattern to mirror for the Character light checkpoint).

## Out of Scope

- **Real Persona LoRA training** (slice 04 productionization) — this PRD assumes
  Personas reach `ready` and consumes their `loraWeightKey`; it productionizes
  **inference**, not **training** (training stays webhook + `waitForEvent`).
- **Audio and Video mediums** (medium roadmap v2/v3), including **voice
  Personas** and family **catchphrases** consumed in narration (parked N4/N5).
- **Social / external auto-publishing** — YouTube channel, Instagram/Facebook
  reels, WhatsApp status (parked C2). Conflicts with private-by-default sharing
  (ADR-0013) and adds a minor-likeness public-exposure surface; deferred for a
  dedicated safety/privacy design.
- **Real Stripe wiring, Supabase Auth wiring, and the deployed durable platform
  choice (Inngest vs Trigger.dev)** beyond the `WorkflowAdapter` seam — those are
  their own infra slices; this PRD targets the generation logic behind the seams.
- **Physical print** (later upsell, PRD v1).

## Further Notes

- The in-memory tracer-bullet in `src/services/storybook.ts` is the behavioral
  spec to preserve: same observable outcomes, real seams underneath. The biggest
  concrete corrections are (1) it stores fal URLs — must store our blob keys
  after moderating bytes; (2) it uses `uuid()`/`Date.now()` — must use
  deterministic keys inside the workflow; (3) it always flips to `draft` and
  always decrements the re-roll budget — must honor the `failed` floor and the
  free-recovery rule; (4) it does not check subscription — must.
- **Personalized Classics** and the **free Character tier** are each their own
  build slice, layered on the productionized core path — not bolted into it.
- The public-domain **catalog sourcing** (ADR-0017) is content/legal work that
  gates the Classics slice shipping; track it as a dependency, not code.
