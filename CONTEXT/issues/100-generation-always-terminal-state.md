# 100 — Generation always reaches a terminal state (every workflow adapter)

Status: shipped

Fixed the root cause of "stuck on Illustrating forever": the never-strand-in-`generating`
backstop lived only in the Inngest `storybookGenerate` function, not the
`LocalDevWorkflowAdapter`/`FakeWorkflow.drain` path the app actually runs locally. Moved
the guard into `StorybookService.runGeneration`/`runGenerationBody` (wrapping `drain`) so
any throw on any adapter forces the book to `failed`; added a watchdog that fails a
non-terminal book after a budget (~5min).
Invariant: a Storybook is always `draft` or `failed`, never stuck in `generating` —
binding on all later generation work.

(condensed 2026-07-07 — full spec in git history)
