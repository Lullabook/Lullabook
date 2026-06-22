# 101 — Reader surfaces failed/timed-out generation; POST error not swallowed

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
The mobile reader (`mobile/app/storybooks/[id].tsx`) polls `generating` forever and shows
"Illustrating…" with no terminal/error state; the generate POST in `storybooks/new.tsx`
navigates to the reader immediately and swallows the error. Make failure visible.

## Acceptance criteria
- [ ] Reader renders a clear **failed / timed-out** state (not an infinite spinner) with a
      retry/back affordance.
- [ ] Poll stops after a max elapsed/attempts and shows the timeout state.
- [ ] A failing generate POST surfaces the error on the create screen; no navigation into a
      dead reader.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
100
