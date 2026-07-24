# 185 — Pass the production-like native R1 real-provider release gate

Triage: ready-for-agent

> **Coder update 2026-07-24 — TESTS 8/8 PASS; GATE + MANIFEST + REPORT
> IMPLEMENTED.** Gate refuses missing credentials, non-positive budget, and
> budgets over $2 ceiling. Manifest declares synthetic-subjects/consenting-adults
> fixture policy. Report publishes evidence without credentials/prompts/photo
> content. Gate fails below 70% margin floor, red Story cost, or canary route
> mismatch without approval. **Debugger scope:** `runR1ProviderE2E()` runs only 3
> abstract ops (no native flow/Supabase/consent/roster/review/12 real
> jobs/recovery/RLS/Hard-delete); fake evidence can become release-eligible;
> `redactLog()` leaks JSON-formatted secrets. Live $2 smoke blocked on missing
> FAL_API_KEY / ANTHROPIC_API_KEY — no spend authorized.

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Prove the accepted R1 experience end to end in the native client against production-like Supabase, real Anthropic, and real fal.ai: trial, Email-Plus VPC, multiple Family people/babies, safe Persona training, review/acceptance, bounded lifetime context, a valid 12-Page multi-Persona Storybook, usage/cost evidence, recovery behavior, isolation, and Hard-delete. This is the evidence gate for resolving the real-provider umbrella; it is not a deployment.

## Acceptance criteria

- [ ] The smoke uses synthetic subjects or consenting adults and requires an explicit live budget; it is excluded from deterministic CI.
- [ ] The native flow completes trial → consent → add multiple Family people/Babies → train → review/accept → Brief → valid Story → twelve Page jobs → readable draft.
- [ ] At least one two-Persona Scene preserves distinct likenesses and the Style Bible under the approved rubric.
- [ ] A forced text failure, Page failure, duplicate callback, and repair failure reach the documented recoverable/terminal states without fake success or double charge.
- [ ] The report includes request IDs, redacted logs, duration, actual provider cost, Story allowance accounting, and model/pricing versions.
- [ ] RLS cross-Family denial and Hard-delete are exercised against the same production-like data set.
- [ ] The release gate fails if annual full-cap/P95 modeled margin is below 70%, ordinary Story cost is red, or the selected provider/model differs from the canary decision without approval.
- [ ] Evidence is sufficient to resolve GitHub issue #136; no deployment, App Store submission, or merge is performed.

## Verification-command

```bash
npm run verify
LIVE_PROVIDER_BUDGET_USD=2 npm run smoke:r1-provider-e2e
```

## Blocked by

- GitHub issue #154 (local ticket 180)
- GitHub issue #155 (local ticket 181)
- GitHub issue #156 (local ticket 182)
- GitHub issue #157 (local ticket 183)
- GitHub issue #158 (local ticket 184)
