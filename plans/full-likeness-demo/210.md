# 210 — Generate the twelve-Page Story text with five-Persona Family context

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Feed the real five-person roster, with relationships and nicknames, into the Sonnet 4.6 Story Context so the Story text names and uses the real family. Harden the twelve-Page contract against a roster this size. Sonnet 4.6 stays the production model.

## Acceptance criteria

- [ ] Generated Story text contains exactly twelve Pages and satisfies the existing semantic Page contract (`FAIL-2`).
- [ ] The Story text references the selected Family members by their roster nicknames and relationships.
- [ ] Story text generation completes p95 under 25 seconds (`LAT-2`).
- [ ] Contract-violating text fails the Brief before any image spend is authorized (`FAIL-2`).
- [ ] An Anthropic 5xx or rate-limit retries twice with backoff, then marks the Brief `failed` with reason `provider_unavailable`, and no image spend follows (`FAIL-7`).
- [ ] The Story Context sent to the provider is bounded in size regardless of roster or Journal growth.
- [ ] The production model remains `claude-sonnet-4-6` (D7).

## Verification-command

```bash
npx vitest run tests/210-story-context-five-personas.test.ts && npm run verify
```

## Blocked by

209

## Invariants restated

LAT-2, FAIL-2, FAIL-7

## Notes

Do not swap the story-text model in this PRD. A cheap-model bake-off is filed separately for after the demo.

**Target backend:** Vercel.
