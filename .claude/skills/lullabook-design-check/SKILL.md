---
name: lullabook-design-check
description: Audit any Lullabook page or component for drift from the "Maya's World" design system and snap it back to the canonical tokens — the linter for the design language. Scans color, type, radius, shadow, spacing, components, and copy, flags every mismatch, and fixes it in place with the nearest role-correct token. Use when asked to design-check / audit / lint a Lullabook screen, to make an existing page "on-brand" or "match Maya's World", to find off-theme colors/fonts/radii/shadows, or after building UI with the lullabook-design skill. Pairs with lullabook-design (the source-of-truth tokens).
---

# Lullabook Design Check — audit & auto-correct to "Maya's World"

The linter for the Lullabook design language: **scan → flag → fix → re-check.**
Read the **lullabook-design** skill (and its REFERENCE.md) first — it holds the
source-of-truth token values this check enforces. Canonical machine-readable values
live in `src/components/v2/tokens.ts`.

## How to run a design check

1. **Load the target.** Open the page/component in preview (or read the source).
   Screenshot it to eyeball against the theme, AND read the markup to grep for raw values.
2. **Scan systematically** through the checklist (see [REFERENCE.md](REFERENCE.md) §2),
   section by section. Don't spot-fix at random — sweep each category in order:
   **color → type → radius → shadow → spacing → components → copy.**
3. **Flag every mismatch:** where it is, what it currently is, what it should be (the
   canonical token), and why.
4. **Fix in place** — replace the offending value with the nearest **role-correct**
   token (mapping tables in REFERENCE.md §3). Match the *intended role*, not just the nearest hex.
5. **Re-screenshot and re-grep** to confirm nothing off-theme remains.
6. **Report** a short before/after summary of what changed.

Work non-destructively: if correcting a live design, copy it (e.g. `Page v2.dc.html`)
before large rewrites so the original is preserved.

## Fast grep sweep (do this first)

Before reading line by line, grep the source for tell-tale off-theme patterns — any hit is a candidate mismatch:

- **Raw colors:** `#000`/`#000000`/`black` (→ `#2E2438`); standalone `#fff` surfaces
  (→ `#FFFDF9`/`#FFF8EC`); `#f5f5f5`/`#eee`/`#ddd`/`#ccc`/`gray`/`grey`; `rgb(0,0,0)`/
  `rgba(0,0,0,…)`; stray blue (`#007bff`,`#2563eb`,`dodgerblue`), generic green
  (`#22c55e`), red (`#ff0000`).
- **Type smells:** `Inter`/`Roboto`/`Arial`/`Helvetica`/`system-ui`/`-apple-system`
  (→ `'Nunito'` or `'Baloo 2'`); any font-family with no Baloo/Nunito.
- **Shape smells:** `border-radius: 0|2|4|6|8px` (too sharp — min ~12px, pills 999px);
  `box-shadow:…rgba(0,0,0,…)` (→ plum-tinted `rgba(58,40,80,…)`/`rgba(106,85,201,…)`);
  `border:…solid #ccc/#ddd/gray` (→ `#ECE1CE`/`#F0E6D2`).
- **Icon smells:** hand-drawn `<svg>` icons, `font-awesome`/`material-icons`/`lucide`/
  `feather` (→ the emoji vocabulary).

Anything that matches → carry into the full checklist.

## Full checklist, mapping & edge cases

The category-by-category checklist (color, gradients, type, radius, shadow, spacing,
components, iconography & copy), the **mismatch → fix mapping table**, the judgment-call
edge cases, and the output format are in [REFERENCE.md](REFERENCE.md).

## Output of a check

Report concisely: (1) what was off-theme, grouped by category; (2) what you changed it
to (the canonical tokens applied); (3) anything you left alone on purpose and why (e.g.
intentional cast-accent variety); (4) a re-check screenshot confirming it now reads as
Maya's World. Keep it short — the value is the corrected design, not a long writeup.
