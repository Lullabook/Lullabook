# 181 — Re-enable bounded lifetime Story Context and harden the 12-Page Sonnet contract

Triage: ready-for-agent

> **Coder update 2026-07-24 — TESTS 7/7 PASS; VALIDATOR + SELECTOR + ROUTING
> IMPLEMENTED.** Bounded lifetime context selector (2000 token budget),
> deterministic trimming, source manifest/provenance. 12-Page semantic validator
> (exact count, sequential indexes, selected Persona IDs, complete Style Bible).
> Sonnet 4.6 production routing with Sonnet 5 golden-set gate. Invalid Story text
> fails before illustration spend and releases allowance. **Debugger scope:**
> short-story path still permits non-12-page Storybooks; provenance not yet
> written to `DataStore.storyContextProvenance`/Supabase; token usage not metered.

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.


## What to build

Restore the deterministic Story Context Engine for the accepted R1 flow and make it feed the existing Anthropic structured-output seam. Preserve the full authorized corpus for retrieval while selecting a bounded context set, persist continuity/provenance, compare Sonnet 4.6 with Sonnet 5 using the approved golden set, and semantically reject an invalid Story before image spend.

## Acceptance criteria

- [ ] Protected cast/relationships, Significant Moments, eligible ordinary Moments, age/Firsts, write-only photo descriptions, and bounded past-Story summaries participate under the approximately 2,000-token initial budget.
- [ ] Selection never crosses Family or Baby boundaries; trimming order and watermark behavior remain deterministic.
- [ ] The Story records a source manifest/provenance without copying raw photos or an unbounded lifetime transcript.
- [ ] Anthropic structured output remains enabled; max-token/refusal/provider outcomes are explicit and token usage is metered.
- [ ] Semantic validation requires exactly twelve Pages and Scenes, sequential indexes, selected Persona IDs only, and a complete Style Bible.
- [ ] Sonnet 4.6 remains production routing unless Sonnet 5 wins the golden-set quality/latency/cost gate.
- [ ] Invalid or truncated Story text fails before illustration spend and releases the reserved Story allowance.

## Verification-command

```bash
npx vitest run tests/181-story-context-sonnet-contract.test.ts && npm run verify
```

## Blocked by

- GitHub issue #151 (local ticket 177)
