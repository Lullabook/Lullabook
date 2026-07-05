# 160 — Finalize a Storybook: server route + reader CTA with confirm

Triage: ready-for-agent

## Parent
PRD v18 — `CONTEXT/planning/prd-v18-pdf-export-keepsake.md`. Aha-path step 9.

## What to build
Expose the existing `StorybookService.finalize` (src/services/storybook.ts:764,
draft → finalized, one-way) end-to-end:

1. **Server:** `POST /api/storybooks/[id]/finalize` — thin route in the shape of the
   existing export route (`getAuthedContext`, 401 unauthed, 400 with the service's
   error message on non-draft). No domain-logic changes.
2. **Mobile API:** `finalizeStorybook(id)` in `mobile/lib/api.ts` following the
   existing fetch-helper conventions.
3. **Reader UI (`mobile/app/(tabs)/stories/[id].tsx`):** a "Finalize keepsake" CTA
   visible only when `status === "draft"`. Tapping opens a confirm sheet/dialog that
   states finalizing **locks re-rolls** (invariant E4), with confirm + cancel. On
   confirm: call the route, then **refetch** the book — the client never sets
   `finalized` locally. On failure: retryable error message, draft state untouched.
   Style per Maya's World canon (E5): theme tokens, emoji icon, Baloo 2/Nunito,
   radius ≥12.

## Acceptance criteria
- [ ] `POST /api/storybooks/[id]/finalize` finalizes an owned draft; 401 unauthed;
      400 (not 500) for non-draft / not-found, book untouched.
- [ ] Reader shows the CTA on drafts only (not generating/failed/finalized); confirm
      sheet names the re-roll lock before anything happens (E4).
- [ ] Status change comes from server refetch only; finalize failure leaves the draft
      intact with a retryable error (E4).
- [ ] After finalizing, the reader reflects `finalized` (badge already exists) and the
      re-roll affordance is gone.
- [ ] New UI passes the design-canon sweeps (E5); no raw hexes, emoji icon, tokens only.
- [ ] Existing suite stays green; root + mobile typecheck clean.

## Verification-command
```bash
npx vitest run tests/160-finalize-storybook.test.ts && npm run verify
```

## Blocked by
None.
