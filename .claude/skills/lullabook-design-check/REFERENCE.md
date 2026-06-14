# Lullabook Design Check Reference — full checklist, mapping & edge cases

The detailed audit material for the **lullabook-design-check** skill. SKILL.md is the
run process + grep sweep; this file holds the full checklist, the mismatch→fix mapping,
edge cases, and the output format. Source-of-truth tokens: the **lullabook-design**
skill (REFERENCE.md) and `src/components/v2/tokens.ts`.

---

## 2. The checklist (sweep in this order)

### A. Color
- [ ] **Background** is `#FBF4E7` (warm cream). Not white, not gray.
- [ ] **Cards/panels** are `#FFFDF9`; inset/secondary surfaces `#FFF8EC`. No pure `#fff`.
- [ ] **Body text** is `#2E2438` (plum-ink); secondary `#6E6076`; soft `#9A8A78`; dates `#A99FB0`. No `#000`/`#333`/gray.
- [ ] **Primary** actions/links use purple `#6A55C9` / `#8B6DF0`; **accent** uses amber `#E79A3C` / `#F6C177`. No stray blue/teal-as-primary.
- [ ] **Borders** are `#ECE1CE` (standard) / `#F0E6D2` (hairline) / `#D8C9B0` (dashed). No gray borders.
- [ ] **Danger** is `#B23A48` (+ `#ECCDD2` border, `#FDF1F3` hover). Not generic red.
- [ ] **Cast accents** (rose/sage/teal/purple/amber) are used for avatars/people, each person consistent.
- [ ] **Greens/successes** use `#E1F1E8` / `#3E7A5A`. **Gold badges** `#FBEBCE` / `#9A6B1E`.
- [ ] The **only dark surface** is the voice panel (`#2A2452`→`#3E2F63`). Flag any other dark block.

### B. Gradients
- [ ] Hero/banner/rail/CTA gradients match the **exact stops** in lullabook-design REFERENCE §1.3. No off-axis angles or invented stops.
- [ ] Avatars use an **AVATAR_GRADIENTS** entry; book covers use a **bookSky** entry.
- [ ] No flat gray/blue gradients; no harsh full-saturation gradients.

### C. Typography
- [ ] Only `'Baloo 2', cursive` (display) and `'Nunito', sans-serif` (body) appear. No Inter/Roboto/Arial/system.
- [ ] Titles, names, nicknames, card headings, story titles → **Baloo 2** (700–800).
- [ ] Body, buttons, labels, chips, inputs → **Nunito**.
- [ ] Eyebrows: uppercase, `letter-spacing:0.16em`, `0.74rem`, weight 800, `#8B6DF0`.
- [ ] Page titles `2.3rem / 800 / -0.02em`. Body line-height ~1.6.
- [ ] Placeholders `#B7A992`.

### D. Radius
- [ ] Buttons/chips/tags/pills = `999px`. No square buttons.
- [ ] Cards = `22px`; inputs = `14px`; rows/book covers = `18px`; hero/banner = `28–30px`.
- [ ] **No radius below ~12px** anywhere. Flag `0/2/4/6/8px`.

### E. Shadow
- [ ] All shadows plum-tinted: `rgba(58,40,80,…)` for neutral elevation, `rgba(106,85,201,…)` for purple hero/CTA glow, `rgba(231,154,60,0.32)` for amber CTA. No `rgba(0,0,0,…)` gray shadows.
- [ ] Card default `0 8px 24px rgba(58,40,80,0.06)`. Hero `0 24px 56px rgba(106,85,201,0.32)`.

### F. Spacing & layout
- [ ] Page centered `max-width:1100–1160px; padding:30px 22px`.
- [ ] Cards padded `22px`; section stacks `gap:22px`; grids `gap:18–22px`.
- [ ] Two-pane forms use `1.5fr 1fr` with a **sticky** right rail (`top:90px`).
- [ ] Groups of chips/buttons/rows use flex/grid + `gap` (not inline/margin spacing).

### G. Components
- [ ] Header is sticky + frosted (`backdrop-filter:saturate(1.3) blur(10px); background:rgba(251,244,231,0.82)`), wordmark = ☀️ tile + "Lullabook" in Baloo 2 800.
- [ ] Nav is a rounded pill bar; active item `#EDE7FE`/`#6A55C9`, inactive transparent/`#6E6076`.
- [ ] Buttons match the recipes (primary purple-gradient, secondary amber-gradient, outline cream, text-link). Hover lifts `translateY(-2px)`.
- [ ] Inputs: `#FBF4E7` fill, `#ECE1CE` border, radius 14, label in Baloo 2 above.
- [ ] Upload zones dashed `#D8C9B0` on `#FFF8EC`; photo slots radius 12 with striped gradient fill.
- [ ] Avatars are gradient circles with white Baloo 2 initials. **(ADR-0020: roster members show a generated avatar, never the raw uploaded photo — flag any raw-photo `<img>` on a display surface.)**
- [ ] Status dots `9px` circles in the three status colors.
- [ ] Every screen opens with **eyebrow → title → lead**.

### H. Iconography & copy
- [ ] Icons are **emoji from the established vocabulary** (lullabook-design REFERENCE §1.7) — no custom SVG/icon-font glyphs.
- [ ] Copy is warm, parent-to-parent, reassuring on privacy. No cold/corporate phrasing. Child's name used naturally.

---

## 3. Mismatch → fix mapping

Apply the nearest **role-correct** token, not just the closest hex.

| If you find… | Replace with |
|---|---|
| `#fff` / `#ffffff` / `white` as a surface | `#FFFDF9` (card) or `#FFF8EC` (inset) |
| Page bg white / gray | `#FBF4E7` |
| `#000` / `#111` / `#222` / `#333` text | `#2E2438` (primary) / `#6E6076` (secondary) |
| gray captions `#888` / `#999` | `#9A8A78` (soft) or `#A99FB0` (dates) |
| `#ccc` / `#ddd` / `#e5e5e5` borders | `#ECE1CE` (standard) / `#F0E6D2` (hairline) |
| generic blue primary | `#6A55C9` (or gradient `linear-gradient(135deg,#8B6DF0,#6A55C9)`) |
| generic green | success `#3E7A5A` on `#E1F1E8`, or sage `#5FB389` |
| generic red / `#ff0000` | `#B23A48` |
| Inter / Roboto / Arial / system-ui body | `'Nunito', sans-serif` |
| any serif/sans heading not Baloo | `'Baloo 2', cursive`, weight 700–800 |
| `border-radius:0–8px` on card | `22px` (card) / `18px` (row) |
| `border-radius:0–8px` on button | `999px` |
| `box-shadow:...rgba(0,0,0,...)` | `0 8px 24px rgba(58,40,80,0.06)` (card) or the role shadow from lullabook-design §1.5 |
| square button, no shadow | primary recipe: purple gradient + `0 8px 20px rgba(106,85,201,0.3)` |
| flat-color CTA | `linear-gradient(135deg,#8B6DF0,#6A55C9)` (purple) or `…#F6C177,#E79A3C` (amber) |
| custom SVG / icon-font glyph | the matching **emoji** from lullabook-design §1.7 |
| dark card (not voice) | recolor to `#FFFDF9` surface; only the voice panel stays dark |
| missing eyebrow/title block | prepend the scaffold (eyebrow → title → lead) |
| raw uploaded photo shown as a member's picture | the generated **Roster avatar** / avatar-gradient circle (ADR-0020) |

---

## 4. Edge cases & judgment calls

- **A value that's close but not exact** (e.g. `#FFFFFF` vs `#FFFDF9`, `#2A2A2A` vs `#2E2438`): still fix it — exactness is what keeps screens consistent.
- **A genuinely new UI element** not covered by the system: build it from existing tokens (nearest card/button/chip recipe). Don't invent a new color or radius to make it work — and don't "improve" the palette.
- **Intentional cast-accent variety** (rose/sage/teal avatars) is *correct*, not a mismatch — don't flatten everyone to purple. The rule is "consistent per person," not "one color everywhere."
- **Dark surface** = only ever the voice panel. Any other dark block is a mismatch.
- **Don't over-correct copy** into blandness — keep the warm, slightly magical voice; only flag genuinely cold/corporate wording.
- **Preserve behavior & content** while you re-skin: change appearance, not the data, labels' meaning, or interactions.

---

## 5. Output of a check

When you finish, report concisely:

1. **What was off-theme** — grouped by category (e.g. "3 gray borders, 1 white card bg, buttons using Inter, 2 square corners").
2. **What you changed it to** — the canonical tokens applied.
3. **Anything you left alone on purpose** — and why (e.g. intentional cast accents).
4. A **re-check screenshot** confirming the page now reads as Maya's World.

Keep it short — the value is the corrected design, not a long writeup.

---

*Pairs with the **lullabook-design** skill (the full design system). Reference
implementation in the repo: `design/lullabook-current-design.html`. Canonical token
values: `src/components/v2/tokens.ts`.*
