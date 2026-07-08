# 152 — Error → tracked issue: auto-open a GitHub issue from a new production error

Status: shipped

Configured Sentry → GitHub integration + Issue Alert rule: new production error auto-creates a
GitHub issue with stack + back-link; recurring instances dedup/group to one issue. Two-way
status sync — resolving in either place closes the other. Gotcha: GitHub integration's Issue
Link settings must be configured or alert-triggered creation silently no-ops. Verified via
`scripts/check-sentry-issue-automation.mjs`; account-level setup documented as a runbook step.

(condensed 2026-07-07 — full spec in git history)
