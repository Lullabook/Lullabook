# 167 — Billing plan-toggle slider balance (Annual/Monthly label no longer clipped)

Triage: ready-for-agent

## Parent
PRD v19 — `CONTEXT/planning/prd-v19-working-core-loop.md`. QA: on `billing.tsx` the
"Annual (save 17%) / Monthly" toggle is unbalanced — the active pill clips the
"Annual (save 17%)" label.

## What to build
1. **Balanced segmented control.** In `mobile/app/billing.tsx`, fix the Annual/Monthly
   toggle so both segments size to their content (equal-width flex segments, or the pill
   sized to the widest label), the active pill fully contains its text with no horizontal
   clipping at any supported width, and the touch targets are even.
2. **Copy fit.** Ensure "Annual (save 17%)" fits inside the active pill on the smallest
   supported device width without truncation (shrink padding / use `numberOfLines={1}` with
   an adequate min-width, or shorten to "Annual · save 17%" if measurement proves it cannot
   fit — but prefer fitting the full label).
3. **Canon styling.** Toggle uses canon tokens (`lullabook-design`); design-check passes.

## Acceptance criteria
- [ ] Neither segment clips its label at the smallest supported width; active pill fully
      contains its text.
- [ ] Segments are visually balanced (equal or content-sized, even touch targets).
- [ ] `lullabook-design-check` passes on `billing.tsx`; mobile typecheck clean; existing
      suite green.

## Verification-command
```bash
npx vitest run tests/167-billing-toggle-balance.test.ts && npm run verify
```

## Blocked by
_none_
