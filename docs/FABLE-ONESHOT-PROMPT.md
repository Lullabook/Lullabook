# Lullabook — Fable 5 One-Shot Build Prompt

> Paste **everything below the line** into Fable 5 (high effort) as a single prompt,
> running inside this repository (`/Users/vraj/Desktop/Work/Lullabook`) with file
> access. It instructs the model to read the `CONTEXT/` folder itself, then build
> the real app on top of the existing tracer-bullet. See the bottom of this file
> for the human operator notes (not part of the prompt).

---

You are a principal full-stack engineer. You are working **inside an existing repository** and your job is to turn a complete in-memory prototype into a real, shippable, beautiful product in one pass. Take the whole task end to end. Do not stop early, do not ask me clarifying questions, and do not hand back stubs — make the best well-reasoned decisions yourself, write complete code, and only flag genuinely external blockers (secrets, legal sign-off) at the very end.

## 0. Read context first (do this before writing any code)

This repo already encodes months of product and architecture decisions. Read these, in this order, and treat them as binding law. Do not contradict them; if you must deviate, leave an explicit `// DEVIATION:` comment explaining why.

1. `CONTEXT/CONTEXT.md` — the canonical glossary. Every term (Story, Storybook, Page, Persona, Character, Family, Member, Guardian, Brief, Prompt, Style Bible, Scene, Story Type, Personalized Classic, Share link, Hard-delete, Jurisdiction, Consent receipt) has a precise meaning. **Use these exact names** in code, types, routes, and UI copy.
2. `CONTEXT/planning/stack.md` — the locked technology choices. Do **not** swap any of them for something you prefer.
3. `CONTEXT/planning/prd-v1.md` and `CONTEXT/planning/prd-v2-generation-pipeline.md` — the product requirements and the full generation-pipeline spec. The PRD v2 "Implementation Decisions" and "Further Notes" sections are the behavioral contract for the core generate path.
4. `CONTEXT/planning/onboarding-and-personas.md` and `CONTEXT/planning/story-format.md` — the user flows and the shape of a Story/Storybook.
5. `CONTEXT/docs/adr/0001` … `0017` — the architecture decision records. **These override your defaults.** Pay special attention to: 0004 (curated/versioned Storybook lifecycle), 0005 (multi-persona scenes), 0007 (data lifecycle + hard-delete), 0008 (verifiable parental consent), 0010 (child-safety defense-in-depth), 0011 (backend architecture: thin request / fat durable workflow), 0012 (illustration pipeline + Style Bible), 0013 (sharing privacy), 0015 (multi-jurisdiction), 0016 (Character two-tier consent), 0017 (Personalized Classics public-domain).
6. `CONTEXT/issues/01` … `22` — the vertical build slices, already specified.
7. The existing code, which is the **behavioral spec you must preserve**:
   - `src/domain/types.ts` — the domain model. Keep these types as the source of truth; extend, don't rewrite.
   - `src/adapters/types.ts` — the provider **ports** (seams). Every external system sits behind one of these interfaces.
   - `src/adapters/fakes.ts` — the in-memory fakes. These define the exact observable behavior the real adapters must reproduce.
   - `src/services/*.ts` — the domain services (storybook, character, text-story, persona, consent-engine, child-safety, subscription, sharing, export, hard-delete, family, jurisdiction, cold-start, onboarding, persona-roster, preflight). This is the business logic; it must keep passing its tests.
   - `src/db/store.ts` — the in-memory `DataStore`.
   - `tests/*.test.ts` — **87 tests across 21 files that currently pass (`npm test`). They must still pass when you are done.** They test behavior at the service seam, not implementation, so you are free to change internals as long as observable behavior holds.

After reading, internalize this mental model: **`Family → Member → Persona/Character → Story → Storybook → Page`**, per-Family Row-Level Security is the isolation boundary, every external provider is behind an adapter port, and the generation pipeline is a **durable workflow**, not an HTTP request.

## 1. Current state (what you are starting from)

- A complete in-memory tracer-bullet: all domain logic exists and 87 tests pass, but **every external provider is faked** and there is **almost no UI** (only `src/app/page.tsx` and `src/app/roster/page.tsx` placeholders).
- No real Supabase/Postgres/RLS, no real Supabase Auth, no real R2/S3 blob store, no real durable workflow engine, no real fal.ai, no real Claude (Anthropic) calls, no real Stripe, no real moderation.
- Stack (from `stack.md`, do not change): **Next.js (App Router) + React 19 + TypeScript**, **Postgres via Supabase** with **RLS**, **Supabase Auth**, **encrypted object storage R2/S3** for sensitive blobs, **durable workflow via Inngest** (choose Inngest), **fal.ai** for LoRA training + image inference, **Claude `claude-sonnet-4-6`** for story text, **Stripe** for subscriptions, web push + email for async notify.

## 2. Your mission

Make Lullabook **real and fabulous** in one pass. Concretely, deliver all of the following, fully wired:

### A. Real adapters behind every existing port (`src/adapters/`)
For each port in `src/adapters/types.ts`, ship a real implementation that reproduces the fake's observable contract against the real service. At minimum:
- **AnthropicAdapter** → real Claude `claude-sonnet-4-6` calls for `generateStory` (Story text + per-Page Scenes + Style Bible in one structured pass) and `adaptStory` (recast a public-domain classic). Use strict structured output matching `GeneratedStory`. Branch the instruction set on `storyType` (bedtime vs learning).
- **fal.ai adapter** → real LoRA-conditioned image inference per Page (`Style Bible + Scene + Persona LoRA(s)`), with a **deterministic idempotency key** derived from `{storybookId}/{pageIndex}/{attempt}`. Multi-persona Pages use sequential-inpaint with the ref-model fallback behind the existing `useReferenceModelForMulti` gate (ADR-0005). Training stays webhook + `waitForEvent` (out of scope to productionize training — assume Personas reach `ready` and consume `loraWeightKey`).
- **ModerationAdapter** → real image+text moderation that checks **bytes before any persist**, including a CSAM hash-match path that **escalates to the HITL/NCMEC flow** (ADR-0010), never a silent quarantine.
- **BlobStore (R2/S3)** → real encrypted put/get/delete with Family-scoped keys (`families/{familyId}/storybooks/{bookId}/pages/{idx}/{deterministicId}.png`) and signed-URL resolution. Hard-delete must actually erase blobs, not just rows.
- **WorkflowAdapter** → real **Inngest** durable workflow: thin request enqueues, fat workflow body runs per-Page memoized steps (`fal-gen-{idx}` → `moderate-{idx}` → `store-{idx}` → `persist-{idx}`), at-least-once replay safe, deterministic keys only (no `uuid()`/`Date.now()` inside the workflow body).
- **ClassicCatalog** → a curated **public-domain** catalog port; seed it with clearly public-domain tales (e.g. *Alice's Adventures in Wonderland*, *The Tale of Peter Rabbit*, *Goldilocks*) and mark catalog entries that still need legal confirmation.
- Stripe, Supabase Auth, consent-engine, child-safety: real wiring behind their seams.

### B. Real persistence: Postgres schema + RLS + migrations
- Author Supabase SQL migrations under `supabase/migrations/` for every entity in `src/domain/types.ts`: Family, Member, Persona, Character, ConsentReceipt, LightConsentReceipt, Subscription, Storybook, Page, PageCandidate, TextStory, ShareLink, ModerationAuditEntry, JurisdictionConfig, plus persisted Style Bible / Scenes / generation state.
- **Row-Level Security on every table**, enforcing per-Family isolation as the security boundary. Guardians have the elevated rights (create Baby Persona, invite/remove Members, hard-delete).
- A real `DataStore`-shaped implementation backed by Supabase that satisfies the same interface `src/db/store.ts` exposes, so services are storage-agnostic.

### C. A beautiful, mobile-first, production-grade web UI for every flow
This is a keepsake product for parents — make it warm, calm, polished, and genuinely delightful, not a CRUD skeleton. Mobile-first responsive, accessible (WCAG AA), tasteful motion, a cohesive soft "bedtime" visual identity (design tokens, dark-friendly). Build the complete App Router surface:
- **Onboarding & auth** (Supabase Auth): sign up, create Family, become Guardian, invite Members, set jurisdiction.
- **Free Character tier** (zero-friction entry, no photos): Trait Questionnaire flow, fictional-vs-real-child branch, light consent attestation where required by jurisdiction, then **text-only Story generation** with Story Type selection and a lovely reading view.
- **Persona creation**: Adult Persona (self, selfie/liveness consent), Baby Persona (Guardian-only, verifiable parental consent via Stripe payment-as-VPC), training → ready → **likeness confirmation** review step.
- **Character → Persona upgrade** (attach photos, carry traits forward).
- **Generate an illustrated Storybook**: the Brief composer (starring Personas, Story Type, theme/lesson, setting/occasion, optional note, curated art-style menu + optional moderated custom style note), submit → returns a `generating` book immediately → **live progress UI** as Pages stream in, failed/quarantined Pages shown as re-rollable holes.
- **Personalized Classics**: pick from the curated catalog → recast Personas → same illustrated pipeline.
- **Curate a draft**: per-Page candidate picker, independent text/illustration re-roll honoring the re-roll budget (free recovery vs paid parent re-roll), finalize.
- **Read / library**: shelf of Storybooks, immersive page-turn reader.
- **Sharing**: create/revoke non-indexed Share links (optional expiry/passcode), Family-visibility rules.
- **Export**: download a finalized Storybook as PDF.
- **Subscription & billing**: Stripe checkout, plan/tier (persona-cap lever), manage/cancel → export-then-purge window.
- **Account & privacy**: data lifecycle, **hard-delete** ("right to be forgotten") with confirmation, jurisdiction-aware notices.
- **Cold-start UX**: graceful empty states guiding a brand-new parent to first value (a free text Story) fast.

### D. API / server layer
Next.js Route Handlers (or server actions) for each flow, calling the existing domain services. The generate endpoints follow **thin request, fat workflow**: validate Brief, run child-safety on any note, gate on active subscription + ready Persona(s) + re-roll budget, create the `generating` Storybook, enqueue the Inngest workflow, return immediately.

### E. Glue
- `.env.example` listing every required secret (Supabase URL/keys, Anthropic API key, fal.ai key, R2/S3 creds, Stripe keys + webhook secret, Inngest keys) with comments. **Never invent real secret values.**
- Stripe + fal.ai webhook handlers.
- A real notification path (email + web push) for "Persona ready" / "Storybook ready".
- Update `package.json` with any new dependencies and scripts; keep `npm test`, `npm run build`, `npm run lint` working.
- A `README` section: how to run locally (Supabase, Inngest dev server, env), how to deploy.

## 3. Hard constraints (non-negotiable — these come from the ADRs)

1. **Keep all 87 existing tests passing.** Run `npm test` mentally against your changes; services keep their observable behavior. Add new tests for every new real adapter and flow (fake the network in unit tests; keep the service-seam testing style).
2. **Preserve the adapter-port seam.** Every external system stays behind its interface in `src/adapters/types.ts`. No service imports a vendor SDK directly.
3. **Per-Family RLS is the isolation boundary.** Every new table has RLS. No cross-Family leakage, ever.
4. **Moderation before persistence.** A generated image's bytes are moderated *before* any blob is stored or shown. On fail: never persist bytes, write an audit record. CSAM-positive escalates to HITL/NCMEC, never a soft quarantine.
5. **Deterministic keys inside the durable workflow.** No `uuid()` / `Date.now()` in the workflow body; all ids derive from `{storybookId}/{pageIndex}(/{attempt})`. Replays must not double-spend fal.ai, must overwrite the same blob key, must upsert the same Page row.
6. **Re-roll cost split.** System-caused recovery regeneration is free; only a parent-initiated re-roll decrements the budget/credits.
7. **`failed` floor.** A Storybook flips `generating → draft` once every Page is terminal (ready/quarantined/failed → re-rollable holes); it flips `generating → failed` only if the Claude pass produced no Story or fewer than the configurable ready-Page floor succeeded.
8. **Subscription gate** on illustrated generation; the free **Character/text tier requires no subscription and no photos/LoRA/biometric**.
9. **Consent is law.** Baby Persona requires Guardian + verifiable parental consent (consent receipt, version-stamped). Adult Persona requires self + liveness. Real-child Character requires the light jurisdiction-aware attestation; fictional Characters skip it. All driven by **configurable per-jurisdiction** rules, never hardcoded thresholds.
10. **Hard-delete really deletes** across Postgres *and* the blob store.
11. **Personalized Classics** are restricted to confirmed public-domain catalog ids; custom twists go through Brief moderation.

## 4. How to work

- **Make decisions.** Where the specs leave a detail open (exact Inngest step layout, UI component library, design tokens, PDF library, email provider), pick the strongest reasonable option, implement it fully, and note the choice in a short `// DECISION:` comment or in the README. Do not ask me.
- **Write complete files.** No `// TODO`, no `// implementation left as an exercise`, no truncated functions, no "...rest unchanged". Every file you output is the full file, ready to run. If a file is large, write all of it anyway.
- **Match the existing code's style** (naming, structure, comment density, the glossary vocabulary). New code should read like the code already there.
- **Order of work:** (1) read context; (2) DB schema + migrations + RLS; (3) real adapters behind ports; (4) wire services to real store/adapters while keeping tests green; (5) durable Inngest workflow for the generate path; (6) API/route handlers + server actions; (7) the full UI surface with the bedtime design system; (8) Stripe/auth/webhooks/notifications; (9) `.env.example`, README, scripts; (10) new tests.
- **Do not break what works.** The tracer-bullet's behavior is the spec. Reproduce it; don't regress it.

## 5. Before you finish — self-verify

Walk this checklist and fix anything that fails before you report done:
- [ ] All 87 existing tests would still pass; new tests cover every new adapter and flow.
- [ ] `npm run build` and `npm run lint` would succeed (no type errors, no unused-import lint breaks).
- [ ] Every external system is behind its adapter port; no SDK leaks into a service.
- [ ] Every table has RLS; Guardian-only actions are enforced server-side, not just hidden in UI.
- [ ] The generate path is a thin request + durable Inngest workflow with deterministic, replay-safe keys.
- [ ] Moderation runs on bytes before any persist; CSAM escalates; audit records written on block.
- [ ] Hard-delete erases Postgres rows *and* R2 blobs.
- [ ] Every glossary term is used correctly in code and UI; no banned synonyms ("soft delete", "Parent Persona", "remix", "country" for jurisdiction, etc.).
- [ ] `.env.example` is complete and contains no real secrets.
- [ ] The UI is mobile-first, accessible, and visually polished across every listed flow — not a skeleton.

## 6. Output

Produce the full set of file changes (new and modified) as complete files, organized by area (migrations → adapters → services/store → workflow → API → UI → config/tests). End with: a concise summary of what you built, every `DECISION:` you made, and a short list of the only remaining **external** blockers (real secret keys to provision, legal public-domain sign-off for the catalog, the Inngest/Stripe/Supabase accounts to create) — nothing that you could have done in code yourself.

Now begin by reading `CONTEXT/` as instructed, then build.

---

## Operator notes (NOT part of the prompt — for the human)

- **How to run it:** open Fable 5 (high effort) in this repo with file access, paste everything between the two `---` rules above, and let it run. It will read `CONTEXT/` itself, so you do not need to paste the docs inline.
- **Why it's structured this way:** context-first (read the ADRs/glossary), explicit "what exists vs what to build", hard constraints lifted straight from the ADRs so the model can't violate them, anti-laziness ("complete files, no stubs"), an execution order, and a self-verify checklist — the standard shape that maximizes one-shot completeness.
- **Caveat on Fable-specific facts:** research on exact Fable 5 context-window / output-token / pricing numbers was not independently verified and some may be model-marketing claims; the prompt is written to be model-agnostic-solid, so it works regardless.
- **Expect a long run.** A one-shot of this size is minutes, not seconds, and may still need a second pass (UI polish, or "continue from file X") — the durable-workflow + RLS + full UI is genuinely a lot. If it truncates, follow up with "continue, output the remaining files."
- **Guardrails worth re-checking after it runs:** RLS on every table, moderation-before-store, deterministic workflow keys, hard-delete hitting the blob store, and that `npm test` is still green.
