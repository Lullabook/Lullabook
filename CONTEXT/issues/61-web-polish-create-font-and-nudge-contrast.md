# 61 — Web polish: Create-page font consistency + World nudge contrast

Triage: ready-for-agent

Source: `CONTEXT/planning/web-and-app-feedback.md` (2026-06-14 run). Both are
display-only fixes; apply via the `lullabook-design` tokens and verify with
`lullabook-design-check`.

## What to build
1. **Create page — consistent font.** The Create page mixes typefaces. Make every text
   element render in the app's standard families (`'Baloo 2'` for display/headings,
   `'Nunito'` for body), per the v2 design system. No stray default/system font.
   - Surface: `src/app/(app)/stories/new` and/or `src/app/(app)/storybooks/new`.
2. **World "What happened today?" contrast.** The Daily-nudge card text color is too
   close to its background and is hard to read. Recolor the text to a token that meets
   legible contrast against the card background (target WCAG AA, ≥ 4.5:1 for body text)
   — e.g. `#2E2438` body / `#6E6076` secondary on the card surface, never a near-background tint.
   - Surface: World home Daily-nudge card (`src/app/(app)/world` / the daily-nudge component).

## Acceptance criteria
- Every text element on the Create page uses Baloo 2 / Nunito; no system/Inter/Arial leak.
- The "What happened today?" nudge text is clearly legible against its background
  (≥ 4.5:1 contrast).
- Only appearance changes — no copy meaning, data, or interactions altered.
- `lullabook-design-check` reports both surfaces clean.

## Blocked by
(none)
