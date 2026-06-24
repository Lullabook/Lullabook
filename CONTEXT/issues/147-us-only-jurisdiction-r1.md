# 147 — US-only jurisdiction for R1.0 (Asia = flagged R1.1 fast-follow)

Triage: ready-for-agent

## Parent
PRD v16 — `CONTEXT/planning/prd-v16-r1-ruthless-cut.md`. Track S3. Sequences ADR-0015.

## What to build
Ship the multi-jurisdiction engine **config-driven** but with **only the US market enabled**
for R1.0. Cut the Asia long pole down to a flagged-off entry that R1.1 enables by **data/config
change, not a rebuild**. A request from a non-US/unsupported market must ride the same config
path — a clean "not available in your region" or US default — never a hardcode, never a crash.

## Acceptance criteria
- [ ] Only the US market is enabled; its consent method, child-age threshold, data-residency,
      and retention/notice come from config (no hardcoded US values scattered in code).
- [ ] A non-US request is handled by the same config path (clean message or US default), **never
      a crash** (failure-mode invariant).
- [ ] Enabling Asia later is a config/data change — no engine rebuild required (assert the Asia
      config slot exists and is flag-disabled).
- [ ] A test exercises US-enabled + a non-US request and asserts no crash + correct gating.

## Verification-command
```bash
npm test -- 147-us-only-jurisdiction
```

## Blocked by
_none_
