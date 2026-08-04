# Session Handoff — Debugger #194

- **Ticket:** #194 / local issue 186 — Make Story generation asynchronous and terminal
- **Stage:** Debugging → Review Ready
- **Commit:** `f0515bb` (`fix(storybooks): fail closed on read workflow misconfiguration`)
- **Scope:** `src/app/api/storybooks/route.ts`; `tests/186-generation-production-composition.integration.test.ts`

## Debug result

Found and fixed one boundary gap: authenticated `GET /api/storybooks` also constructs the request context and therefore can throw `WorkflowConfigurationError` when production lacks durable dispatch configuration. `GET` now returns the same typed 500 `{ code: "workflow_not_configured" }` fail-closed response as `POST`. Added a regression test.

The existing #194 implementation was also red-teamed for production dispatch, credential-free workflow envelopes, text/page idempotency, terminal transitions, watchdog recovery, and exactly-once reservation release; no additional defect was found in this lane.

## Evidence

```text
npx vitest run tests/186-generation-queue-terminal.test.ts tests/186-generation-production-composition.integration.test.ts
Test Files 2 passed (2)
Tests 16 passed (16)
```

`npm run verify` was rerun. It is currently red because the shared worktree contains concurrent, uncommitted coder-owned changes for #197/#198/#200 (including unrelated tests and web/Playwright setup). Those paths were not touched or staged by this stage. Re-run the ticket command after the shared worktree settles; reviewer should judge the diff independently.

## Reviewer notes

- No provider credentials are added to the durable event envelope.
- No provider call occurs before production dispatch configuration is validated.
- The change is limited to the GET fail-closed boundary and its regression test.
- Do not treat the unrelated dirty paths as part of this ticket's diff.
