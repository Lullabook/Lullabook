---
name: lullabook-design
description: Build new Lullabook pages and components in the "Maya's World" design system — warm cream-paper, dusk-purple, golden-amber storybook aesthetic with Baloo 2 / Nunito type, pill radii, plum-tinted shadows, and emoji iconography. Use when creating or styling any Lullabook UI (web or mobile screens, cards, buttons, forms, avatars, book covers, voice panels), when asked to make something "on-brand" / "look like Lullabook" / "Maya's World", or when you need the canonical color/type/radius/shadow tokens. Pairs with lullabook-design-check (the linter that audits against these tokens).
---

# Lullabook Design — "Maya's World" (v2)

Lullabook turns a child's real life into illustrated, voiced bedtime storybooks.
The aesthetic is **warm, hand-drawn-storybook, twilight-cozy**: cream paper,
dusk-purple, golden-hour amber. Every screen should feel like a softly lit
children's book, never a clinical SaaS dashboard.

> **One rule above all:** never invent new colors, fonts, radii, or shadows. Pull
> from the tokens. If something isn't covered, build it out of the existing pieces.
> Canonical machine-readable values live in `src/components/v2/tokens.ts`.

## Quick start

**Fonts** (load once):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet">
```
- **Display** `'Baloo 2', cursive` (700–800) → titles, names, nicknames, card headings, story titles.
- **Body** `'Nunito', sans-serif` → everything else.

**Core palette** (carries 90% of every screen):
`background #FBF4E7` · `surface #FFFDF9` · `surfaceAlt #FFF8EC` · `border #ECE1CE` ·
`text #2E2438` (never pure black) · `textMuted #6E6076` · `primary #6A55C9` ·
`primaryLight #8B6DF0` · `accent #E79A3C`. Danger `#B23A48`. The **only** dark
surface is the voice panel (`#2A2452`→`#3E2F63`).

**Every screen opens with eyebrow → title → lead:**
```html
<div style="display:flex; flex-direction:column; gap:22px;">
  <div>
    <p style="text-transform:uppercase; letter-spacing:0.16em; font-size:0.74rem; font-weight:800; color:#8B6DF0; margin:0 0 6px;">⚙️ Section eyebrow</p>
    <h1 style="font-family:'Baloo 2',cursive; font-weight:800; font-size:2.3rem; margin:0; color:#2E2438; letter-spacing:-0.02em;">Page title</h1>
    <p style="margin:6px 0 0; color:#6E6076; font-size:1.02rem; max-width:580px;">One warm sentence of context.</p>
  </div>
  <!-- content -->
</div>
```

## Workflow

1. Start from cream `#FBF4E7`; build with `#FFFDF9` cards; accent sparingly with purple + amber.
2. Open every screen with the eyebrow → title → lead scaffold above.
3. Reach for a **component recipe** (card, button, chip, avatar, input, upload zone,
   gradient rail, book cover, voice panel, status dot) — don't freehand. Recipes,
   gradients, radii, shadows, and layout grids are in [REFERENCE.md](REFERENCE.md).
4. Keep everything pill-rounded (`999px` for anything clickable & small; `22px` cards)
   and softly shadowed (plum-tinted, never gray/black).
5. Use the established **emoji vocabulary** as icons — never custom SVG/icon-font.
6. Give each cast member a **consistent avatar gradient** (assign by index).
7. Write warm, parent-to-parent copy; reassure on privacy.
8. When done, run **lullabook-design-check** to lint the result against the tokens.

## Do / Don't

**Do** — cream base + `#FFFDF9` cards; Baloo 2 for storybook feel, Nunito for the rest;
pill-rounded + soft plum shadows; consistent per-person avatar gradients; emoji icons.

**Don't** — new hues, pure black/white, or hard gray shadows; sharp corners or thin
SaaS borders; custom SVG icons; dark surfaces anywhere except the voice panel; crowded
screens (keep 22px card padding, 26px grid gaps).

## Full reference

The complete token system — every color/gradient/radius/shadow, the layout grids,
the sticky frosted header + nav pill, all 10 component recipes, motion keyframes, the
emoji vocabulary, and voice/copy guidance — is in [REFERENCE.md](REFERENCE.md).
Reference implementation: `design/lullabook-current-design.html`. Canonical tokens:
`src/components/v2/tokens.ts`.
