# PRD v18 — PDF Export keepsake: finalize + export on mobile

> Status: ready for agent. Planning artifact from `/planner` (2026-07-05). Completes R1
> aha-path steps 9–10 (finalize → export) from
> [`r1-release-scope-and-invariants.md`](r1-release-scope-and-invariants.md). Grilled
> decisions locked with the founder this session; invariants E1–E6 below are the
> red-team targets for `/coder` and `/debugger`.

## Why this wave

R1's keepsake promise — "Export PDF, no Share links" — is half-built. The server has
`ExportService.exportPdf` (ownership-checked, finalized-only, signed image URLs) and
`StorybookService.finalize` (draft → finalized), but **no API route exposes finalize**,
and the mobile reader has **no finalize or export affordance at all**. A parent can
generate and read a book but never keep it — the aha path dead-ends at step 8. This is
the largest remaining demo gap (per the 2026-07-05 debugger handoff) and the last unshipped
R1 core-loop step.

## Grilled decisions (locked 2026-07-05)

| Fork | Decision | Rationale |
|------|----------|-----------|
| Finalize UX | **Explicit "Finalize keepsake" CTA + confirm sheet** on drafts; export appears only once finalized | Finalize is one-way in the domain (locks re-rolls, no un-finalize). Irreversible steps stay deliberate; matches aha-path ordering |
| Delivery | **iOS share sheet** via `expo-file-system` + `expo-sharing` (both Expo Go SDK 56-safe) | Download with auth header to app cache, then native share sheet (Files/AirDrop/Mail). Honors "likeness leaves the device only via user-initiated local export" |
| Failure contract | **30s p95 budget, manual retry, book stays finalized** | Blocking progress on the button, 45s client timeout, retryable error, no auto-retry loop, no state corruption |
| Gating | **Ownership + finalized status only** | R1 is one-plan: nobody holds a finalized book without an active trial/sub. No new entitlement check; server stays source of truth |

No glossary changes: `CONTEXT.md` already defines **Export** (durable PDF of a
finalized Storybook, the keepsake-survives-cancellation mechanism) and **finalized**
(terminal, shareable state). This PRD implements that language.

## Invariants (named, testable — issues restate the relevant ones)

- **E1 — Export latency budget.** PDF export p95 < **30s** for a ≤8-page book; client
  aborts at **45s**. The button shows a blocking in-progress state; the UI is never a
  frozen or blank wait. Reader page-turn stays <100ms throughout.
- **E2 — Export failure mode.** Server error / timeout / abort → the book **remains
  `finalized` and untouched**; the client surfaces a clear retryable error and the
  button returns to its idle "Export PDF" state. One manual retry affordance, no
  auto-retry loop. A failed/partial download never leaves a corrupt PDF in cache
  (delete on failure).
- **E3 — Likeness egress boundary.** The PDF is fetched **with the auth bearer**;
  the server enforces ownership + `finalized` (already does). The file is written only
  to the **app sandbox cache** and leaves the device **only via the user-initiated
  share sheet**. No share links, no remote hosting, no new egress path.
- **E4 — Finalize is server-authoritative and deliberate.** The confirm sheet states
  that finalizing **locks re-rolls**. Status flips only via the server route
  (existing `StorybookService.finalize`); the client never sets `finalized` locally —
  it refetches. Finalize failure leaves the draft untouched with a retryable error.
- **E5 — Design canon.** All new UI uses `mobile/constants/theme.ts` tokens, Baloo 2 /
  Nunito, emoji icons, radii ≥12 (pills 999), no raw hexes, no gray/black shadows.
  Guarded by the existing 149/156-style sweeps.
- **E6 — No dead buttons.** On platforms where sharing is unavailable (expo-web dev
  preview), the export CTA is **hidden, not present-and-throwing** (same doctrine as
  the 159 Apple-button fix). Finalize (a plain POST) may remain on web.

### Failure modes, per dependency

| Dependency | Down / slow / garbage | User sees | Handling |
|---|---|---|---|
| Export route (server PDF assembly) | 5xx / timeout / non-PDF body | Error toast + idle retryable button | No state change (E2); client validates it got a PDF before sharing |
| Finalize route | 5xx / non-draft conflict | Error toast, CTA stays | Draft untouched (E4); refetch shows truth |
| expo-sharing | `isAvailableAsync()` false | No export button on that platform | Hidden, never dead (E6) |
| File system (cache write) | Write fails / disk full | Same retryable error as E2 | Partial file deleted |

## Scope

**In:** `POST /api/storybooks/[id]/finalize` thin route over the existing service;
mobile API helpers (finalize, authenticated PDF download); reader Finalize CTA +
confirm sheet; Export PDF button + progress/error states + share sheet; the two new
Expo deps; invariant guard tests; lighting up the export step in the existing Maestro
core-loop flow where feasible.

**Out (unchanged R1 cuts):** share links, print products, export of drafts, credit
metering of exports, Android/web as shipping surfaces, any domain-logic change beyond
the thin finalize route.

## Slices

Issues **160–161** (dependency-ordered, each with a runnable Verification-command):
160 finalize (route + CTA, vertical), 161 export (deps + download + share + guards).
See `CONTEXT/issues/160-*.md`, `161-*.md`.
