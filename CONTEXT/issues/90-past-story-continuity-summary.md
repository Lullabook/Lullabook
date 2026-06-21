# 90 — Past-Story continuity summary (anti-repeat input)

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track B.

## What to build
The bounded per-Baby artifact the context engine (issue 89) uses for **continuity and
anti-repeat**, so generation doesn't retell the same plot.

- On Storybook **finalization**, produce and store a **short rolling summary** (bounded
  length) of the Story: protagonist beats, theme, notable named entities used.
- Maintain a per-Baby rolling window (newest-N finalized Stories) so the summary stays
  small and cheap.
- Expose it to the engine as the `past-Story summary` input; the engine instructs the
  Prompt to **avoid repeating** recent plots/themes.

## Acceptance criteria
- [ ] Finalizing a Storybook writes a bounded summary; the rolling window caps total size.
- [ ] The engine receives the summary and the generated Prompt reflects an anti-repeat
      instruction when prior Stories exist.
- [ ] **Failure invariant:** no prior Stories → summary input is empty and generation
      proceeds normally (no error).
- [ ] **Security invariant:** the summary is Family-scoped, contains no raw photo data,
      and is purged by hard-delete (ADR-0007).
- [ ] Tests cover summary creation on finalize, the rolling-window cap, and the empty case.

## Verification-command
```bash
npm test -- past-story-summary && tsc --noEmit
```

## Blocked by
89
