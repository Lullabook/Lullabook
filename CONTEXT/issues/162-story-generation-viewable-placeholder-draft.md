# 162 — Story generation → viewable placeholder-art draft (never failed-with-zero-pages)

Triage: ready-for-agent

## Parent
PRD v19 — `CONTEXT/planning/prd-v19-working-core-loop.md`. The headline: make the core R1
promise (an illustrated story starring the baby) actually produce a viewable book, with
**placeholder art** when there is no trained likeness (grill decision 3).

## What to build
1. **Diagnose the real throw first.** `POST /api/storybooks` returns 201 after ~51s but the
   book lands `failed` with **zero pages** even though `ANTHROPIC_API_KEY`/`FAL_API_KEY` are
   set and `claude-sonnet-4-6` returns HTTP 200. Reproduce against the paid dev server
   (`npm run dev:paid`) or the 153 seed, capture the actual error (instrument
   `runGenerationBodyInner` / `anthropic.generateStory` response parse at
   `src/adapters/anthropic.ts:143` — likely a `JSON.parse`/`tool_use`-vs-`text` block or an
   empty-pages parse), and write a failing test that reproduces it before fixing.
2. **Persona-free / Character-only generation.** A Brief that stars only
   [Characters](../CONTEXT.md#character) (photo-free) or has no ready Persona must generate:
   - `generate()` (`src/services/storybook.ts:107`) must not require a Persona when the Brief
     is Character-only (the `starringPersonaIds` ready/likeness loop at :133 only applies to
     personas that are actually named).
   - `runPagePipeline` must not throw on `personas[0]!` when `personas` is empty
     (`src/services/storybook.ts:515`) — fall through to the placeholder-art branch.
3. **Placeholder-art degradation (I2.2).** When no ready Persona OR fal errors/rate-limits,
   every page lands as a **placeholder-art page** (a deterministic generic illustration, no
   raw photo, no likeness — I3.1) and the book reaches **`draft`** (text-viewable), never
   `failed`-with-zero-pages once the text pass succeeded. Reuse the existing text-viewable
   degradation (issue 102) rather than inventing a new terminal.
4. **Terminal correctness (I2.1).** If the **text** pass itself refuses/throws/returns no
   pages, the book reaches `failed` with the existing retryable "Try again" affordance — no
   silent hang, no stranded `generating`.

## Acceptance criteria
- [ ] I2.2: a persona-free / Character-only Brief → `draft` with N placeholder pages
      (N = resolved page count), **never** `failed`-with-zero-pages when text succeeded.
- [ ] I2.1: text-pass refusal/throw/empty → terminal `failed` + retryable CTA; watchdog
      still reaps any `generating` past budget (I1.1: text p95 < 25s, book p95 < 90s).
- [ ] I3.1: placeholder art renders no raw uploaded photo and trains no likeness;
      Character-only book stays photo-free / no consent gate.
- [ ] On device: creating the Bedtime book from the Create screen with the seed cast yields
      a readable book (pages visible in the reader), not "No pages yet."
- [ ] Existing suite green; root typecheck clean.

## Verification-command
```bash
npx vitest run tests/162-story-generation-placeholder-draft.test.ts && npm run verify
```

## Blocked by
_none_
