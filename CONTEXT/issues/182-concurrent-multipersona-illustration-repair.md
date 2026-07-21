# 182 — Generate twelve multi-Persona Pages concurrently with bounded repair

Triage: ready-for-agent

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Generate a valid Storybook’s twelve Pages as bounded concurrent jobs using the canary-selected default. Compose one to three starring Personas in one multi-LoRA request, preserve the Style Bible across Pages, expose partial failures as re-rollable holes, and route only failed/high-value Pages through bounded Nano Banana repair.

## Acceptance criteria

- [ ] One to three Persona LoRAs are passed in one generation request; fake face labels are not treated as masks or coordinates.
- [ ] Twelve Page jobs fan out under a bounded concurrency limit and settle under the book watchdog without sequential latency.
- [ ] Every Page request carries the same Style Bible, deterministic seed metadata, selected Persona IDs, and provider/model version.
- [ ] A failed Page becomes a visible re-rollable hole while valid Story text and successful Pages remain available.
- [ ] Repair tries the configured cheap route before Pro, is limited per Page/Storybook, and never silently regenerates all Pages.
- [ ] Provider safety remains enabled and application moderation rejects unsafe output.
- [ ] Terminal Storybook status matches the glossary contract and no fallback emits placeholder success in production.

## Verification-command

```bash
npx vitest run tests/182-multipersona-page-fanout.test.ts && npm run verify
```

## Blocked by

- GitHub issue #150 (local ticket 176)
- GitHub issue #154 (local ticket 180)
- GitHub issue #155 (local ticket 181)
