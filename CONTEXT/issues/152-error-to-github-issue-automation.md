# 152 — Error → tracked issue: auto-open a GitHub issue from a new production error

Triage: ready-for-agent

## Parent
PRD v17 — `CONTEXT/planning/prd-v17-test-framework-and-logging.md`. Track T3.

## What to build
Close the "bugs instantly go to a tracker" loop. Configure the Sentry → GitHub integration and an
**Issue Alert rule** that auto-creates a GitHub issue when a **new** production error is first
seen, with the stack trace + a back-link, and **two-way status sync** (resolve in either place
closes the other). Errors are deduped/grouped by Sentry so a recurring crash is one issue, not
hundreds. (Setup includes the known gotcha: the GitHub integration's Issue Link settings must be
configured or alert-triggered creation silently no-ops.)

## Acceptance criteria
- [ ] A new production error auto-creates a GitHub issue with stack + Sentry back-link.
- [ ] Recurring instances of the same error map to **one** issue (dedup/grouping), not many.
- [ ] Resolving the Sentry issue closes the GitHub issue and vice versa (two-way sync verified).
- [ ] Documented as a runbook step in the handoff/CONTEXT (account-level config a human performs
      once); a smoke or documented manual check confirms the path end-to-end.

## Verification-command
```bash
node scripts/check-sentry-issue-automation.mjs
```

## Blocked by
150
