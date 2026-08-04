# Session handoff — 2026-07-07 — /coder issue 175 restyle + caveman doc condensation

## What this session did
Two workstreams on branch `feat/mayas-world-restyle` (never main):

1. **Issue 175 — Maya's World mobile restyle** (commit `e54acbe`). Merged the web app's
   look with the sim's practicality across **13 screens + character-form**: cream/twilight
   palette, Baloo titles, `BOOK_SKIES` gradient covers, `TYPE_LABEL`/`STATUS_LABEL` chips,
   storybook shelf, plum shadows, `BANNER_CREAM_SOFT` banners, `AVATAR_GRADIENTS` roster.
   New shared component `mobile/components/story-cover.tsx` (gradient book covers — one
   consistent cover renderer used by shelf, reader, create, daily). `tsc --noEmit` clean.
2. **Caveman-mode condensation of CONTEXT/docs** (this commit). Every *historical* doc
   collapsed to title + `Status` + still-binding decisions + `(condensed 2026-07-07 —
   full text in git history)`:
   - `CONTEXT/issues/` — all shipped issues (1–167) condensed to ~10–15 lines; **active
     R1 issues 168–175 kept full**.
   - `CONTEXT/planning/` — superseded PRDs v1–v18 condensed; **active v19/v20 and the two
     r1-* invariants docs kept full**; `stack.md` kept (load-bearing).
   - `CONTEXT/handoffs/` — all handoffs before 2026-07-06 condensed to `Status: historical`
     stubs; **2026-07-06/07 handoffs kept full** (current context).
   - `CONTEXT/local-dev/` — RUN-LOCAL + HITL runbook tightened (active runbooks, still usable).
   - Deleted obsolete one-shot prompts: `docs/ANTIGRAVITY-WEB-BUGFIX-PROMPT.md`,
     `docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md`, `docs/FABLE-ONESHOT-PROMPT.md`.

## Still-binding decisions from the restyle
- **Design source of truth** is the lullabook-design skill ("Maya's World" v2): cream paper,
  dusk plum, twilight-cozy. Mobile screens must match the web look while keeping sim
  practicality (touch targets, loading/error/empty states, no decorative-only controls).
- **One cover renderer**: `story-cover.tsx` — do not fork per-screen gradient covers again.
- Restyle intentionally shipped **no behavior changes** — visual layer only.

## State / next steps
- GitHub issue **#130** (= CONTEXT issue 175) to be closed on merge; PR from
  `feat/mayas-world-restyle` → default branch (never push main).
- Next build work: R1 monetization issues **168–174** (see 2026-07-07-planner handoff +
  PRD v20) — SEC-1..4 invariants are the red-team targets.
- Condensation rule going forward: when an issue ships or a PRD is superseded, condense it
  in the same session — full text always recoverable from git history.
