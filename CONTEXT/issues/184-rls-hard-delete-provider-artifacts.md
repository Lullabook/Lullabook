# 184 — Prove RLS isolation and Hard-delete across context and provider artifacts

Triage: ready-for-agent

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.


## What to build

Extend the Family isolation and Hard-delete proof to every object added or exposed by the multi-Persona/provider flow: Babies, people/bonds, Consent receipts, source photos, review samples, Roster avatars, provider requests, LoRA weights/configuration, Story Context/provenance, Storybooks, Pages, and cost records. Deletion must cross database, blob, and provider boundaries without relying on application filtering alone.

## Acceptance criteria

- [ ] Production migrations enable and test RLS policies for every Family-owned table in scope.
- [ ] Two authenticated Families cannot read, update, delete, or infer each other’s rows or object keys.
- [ ] Hard-delete inventories all owned database/blob/provider artifacts, removes them idempotently, and reports any provider deletion limitation explicitly.
- [ ] Temporary provider URLs and Family-owned object keys have distinct lifecycle semantics.
- [ ] Revoked consent triggers the required child-data purge path and cannot leave a ready Persona or usable LoRA.
- [ ] Cost/audit records retain only the legally approved non-content evidence or are purged according to the accepted policy; no raw prompt/photo content survives.
- [ ] Deletion remains available even when generation, subscription, or a provider is degraded.

## Verification-command

```bash
npx vitest run tests/184-provider-artifact-delete-rls.test.ts && npm run verify
```

## Blocked by

- GitHub issue #152 (local ticket 178)
- GitHub issue #153 (local ticket 179)
- GitHub issue #157 (local ticket 183)
