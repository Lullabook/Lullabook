# 89 — Story Context Engine core (ADR-0022)

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track B.

## What to build
The deterministic context selector that generalizes issue 54 / ADR-0019 from
Moments-only to the full **story context set**, feeding the Prompt builder as
background material distinct from the Brief.

- Assemble, for a Baby: **significant Moments** (always), **ordinary Moments since the
  Baby's last Story** (watermark), **roster cast** (members + relationships/nicknames
  from the Brief), **age / Firsts**, a **past-Story summary** (input from issue 90), and
  **moment-photo vision-text** (ADR-0021 — never raw images).
- **Bound** the set by a token budget (~2000) + a newest-N ceiling; when trimming, drop
  ordinary Moments before significant ones; protect cast + past-Story summary.
- Advance the per-Baby **watermark only on a generation that reaches Story text**.
- **No extra LLM call.** Leave a typed seam (`ContextSelector` interface) so an
  LLM-ranking selector can replace the rule-based one later without changing the Prompt
  builder contract.

## Acceptance criteria
- [ ] Generating for a Baby injects the correct context set: significant always; ordinary
      only since last Story; cast/age/firsts/past-summary/vision-text when present.
- [ ] **Latency invariant:** assembly is pure DB reads + concatenation, adds **<200ms**,
      and the emitted context is **≤~2000 tokens** (cap enforced, significant wins on trim).
- [ ] **Failure invariant:** an empty/missing source (no Moments, no past Story) degrades
      to roster+age and never throws; a malformed Moment is skipped, not fatal.
- [ ] **Security invariant:** selection honors per-Family RLS, **never crosses Babies**,
      and uses **write-only vision→text** only (no raw image in the Prompt/output).
- [ ] Watermark advances on success, holds on failure (ADR-0019 contract preserved).
- [ ] Tests (test-first) cover the contract, the cap/trim order, and the RLS/cross-Baby guard.

## Verification-command
```bash
npm test -- context-engine && tsc --noEmit
```
Exits 0 iff the selector contract tests (significant-always, since-last-Story window,
token cap + trim order, empty-source degrade, watermark advance/hold, cross-Baby guard)
pass and the project typechecks.

## Blocked by
None — builds on the existing Prompt builder; subsumes issue 54 (Moments become one input).
