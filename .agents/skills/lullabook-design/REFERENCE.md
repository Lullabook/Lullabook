# Lullabook Design Reference — full "Maya's World" token system

The complete source of truth for building Lullabook UI. SKILL.md is the quick
start; this file holds every token and recipe. Canonical machine-readable values:
`src/components/v2/tokens.ts`.

---

## 1. Foundations

### 1.1 Fonts

Two families, loaded from Google Fonts. Display is for anything that should feel storybook-warm (titles, names, nicknames, labels on cards); body is for everything else.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet">
```

| Role | Stack | Use for |
|------|-------|---------|
| **Display** | `'Baloo 2', cursive` | Page titles (h1/h2/h3), names, nicknames, card headings, the wordmark, big numbers, story titles on covers. Weights 700–800. |
| **Body** | `'Nunito', sans-serif` | Paragraphs, buttons, labels, chips, inputs, metadata. Weights 400–800; italic 400/600 for quotes. |

- Body line-height: **1.6** for running text, 1.45–1.5 in tight cards.
- Page titles: `font-size: 2.3rem; font-weight: 800; letter-spacing: -0.02em;`
- Eyebrow (above titles): `text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.74rem; font-weight: 800; color: #8B6DF0;`
- Placeholders are warm sand: `::placeholder { color: #B7A992; }`
- Empty/placeholder states can use a mono stack (`var(--font-mono, monospace)`) to read as "to be filled."

### 1.2 Color tokens

Core surfaces and text — these carry 90% of every screen.

| Token | Hex | Role |
|-------|-----|------|
| `background` | `#FBF4E7` | App background — warm cream paper. The default canvas. |
| `surface` | `#FFFDF9` | Cards, panels, header — near-white warm. |
| `surfaceAlt` | `#FFF8EC` | Inset/secondary surface, ghost-button fill, upload zones. |
| `border` | `#ECE1CE` | Standard 1px card border. |
| `borderSoft` | `#F0E6D2` | Hairline dividers inside cards. |
| `borderDashed` | `#D8C9B0` | Dashed borders on upload zones & "add new" tiles. |
| `text` | `#2E2438` | Primary text — deep plum-ink, never pure black. |
| `textMuted` | `#6E6076` | Secondary body text. |
| `textSoft` | `#9A8A78` | Captions, hints, "in 3 stories". |
| `textDate` | `#A99FB0` | Timestamps. |

Brand & accent:

| Token | Hex | Role |
|-------|-----|------|
| `primary` | `#6A55C9` | Dusk purple — primary brand, links, active text. |
| `primaryLight` | `#8B6DF0` | Lighter purple — eyebrows, focus rings, highlights. |
| `primaryBg` | `#EDE7FE` | Pale lilac — selected pills, purple tag backgrounds. |
| `primarySelectedText` | `#4A3D6B` | Text on selected purple surfaces. |
| `accent` | `#E79A3C` | Golden-hour amber — secondary CTA, "they call Maya". |
| `accentLight` | `#F6C177` | Light amber — gradient partner, active toggle. |
| `accentDarkText` | `#3a2410` | Dark brown text on amber buttons. |
| `badgeGold` | `#FBEBCE` | Gold badge background ("✨ Illustrated"). |
| `badgeGoldText` | `#8C611B` | Gold badge text (darkened from `#9A6B1E` for WCAG AA 4.65:1 on `badgeGold`). |
| `danger` | `#B23A48` | Destructive actions, delete zones. |

Cast accents (rotate these for avatars / family members so each person has a consistent color):

| Token | Hex | Light partner |
|-------|-----|---------------|
| `rose` | `#E78AA0` | `roseLight #F2A6B8` |
| `sage` | `#5FB389` | `sageLight #9FD8B1` |
| `teal` | `#3f9bb0` | `tealLight #7fc8c0` |
| `primaryLight` | `#8B6DF0` | (pairs with `primary`) |
| `accent` | `#E79A3C` | `accentLight #F6C177` |

Special-purpose:

| Token | Hex | Role |
|-------|-----|------|
| `hoverTint` | `#F6F1FF` | Hover background on purple-outline elements. |
| `chipGreenBg` / `chipGreenText` | `#E1F1E8` / `#3C7556` | Green "tip" / success chips & check dots (text darkened from `#3E7A5A` for WCAG AA 4.64:1). |
| Night panel | `#2A2452` → `#3E2F63` | Voice-recording panels (the only dark surface). |
| `voiceMuted` `#C9BDE8`, `voiceQuote` `#D7CBEE`, `voiceCream` `#FAF4E6`, `waveformBar rgba(185,165,245,0.75)` | Text/waveform inside night panels. |
| Status dots | ready `#5FB389`, training `#E79A3C`, needs-photos `#C9A9A9` | Likeness-training status. |

### 1.3 Gradients

Never freehand a gradient — use these exact stops.

```
hero        linear-gradient(135deg,#6A55C9 0%,#B5739E 48%,#F0A878 100%)   /* big hero headers */
banner      linear-gradient(135deg,#6A55C9 0%,#B5739E 52%,#F0A878 100%)   /* continue-reading / profile banners */
briefRail   linear-gradient(160deg,#6A55C9,#B5739E)                       /* sticky side rails, "why this helps" */
voicePanel  linear-gradient(160deg,#2A2452,#3E2F63)                       /* voice recorder (dark) */
ctaPurple   linear-gradient(135deg,#8B6DF0,#6A55C9)                       /* primary buttons, brand icon */
ctaAmber    linear-gradient(135deg,#F6C177,#E79A3C)                       /* secondary buttons */
progressFill linear-gradient(90deg,#FFFDF9,#F6C177)                       /* progress bars on dark */
coverShade  linear-gradient(to top,rgba(20,14,40,0.78),transparent)       /* text scrim on book covers */
```

Avatar gradients (assign by index so a person keeps their color):
```
linear-gradient(150deg,#8B6DF0,#6A55C9)
linear-gradient(150deg,#E79A3C,#F6C177)
linear-gradient(150deg,#E78AA0,#F2A6B8)
linear-gradient(150deg,#5FB389,#9FD8B1)
linear-gradient(150deg,#3f9bb0,#7fc8c0)
```

Book-cover skies (rotate by index for story covers):
```
linear-gradient(160deg,#4a7f5a,#e8c46a)   linear-gradient(160deg,#5b8fb0,#cfe6f0)
linear-gradient(160deg,#2f9bb0,#f6d9a0)   linear-gradient(160deg,#7a3f6e,#f2a6b8)
linear-gradient(160deg,#3b2f6e,#6a55c9)   linear-gradient(160deg,#8a5a86,#f6b98c)
```

### 1.4 Radii (px)

Generous, pill-heavy, friendly. Nothing sharp.

| Name | px | Used on |
|------|----|---------|
| `pill` | 999 | Buttons, chips, tags, nav items, status pills. **Default for anything clickable & small.** |
| `slot` | 12 | Photo/upload squares. |
| `brandIcon` | 13 | The ☀️ wordmark tile. |
| `audio` | 14 | Audio rows, generate button, inputs (inputs use 14). |
| `nicknameBox` / `storyTypeCard` | 16 | Inset key-value boxes, story-type cards. |
| `row` / `book` | 18 | List rows, book covers, info cards. |
| `voicePanel` | 20 | Voice panel, char-avatar tile. |
| `card` | 22 | **Default card radius.** |
| `detail` / `banner` | 26 / 28 | Profile detail cards, hero banners. |
| `hero` | 30 | Top-level hero block. |

Inputs/textareas: `border-radius: 14px;` fill `#FBF4E7`, border `1px solid #ECE1CE`, padding `13px 15px`.

### 1.5 Shadows

Soft, plum-tinted, never gray/black-harsh.

```
nav            0 4px 14px rgba(58,40,80,0.05)
brandIcon      0 6px 16px rgba(106,85,201,0.35)
card           0 8px 24px rgba(58,40,80,0.06)        /* default card */
charCard       0 8px 22px rgba(58,40,80,0.07)
familyDetail   0 12px 32px rgba(58,40,80,0.08)
book           0 12px 28px rgba(58,40,80,0.16)   (hover 0 22px 44px rgba(58,40,80,0.26))
hero           0 24px 56px rgba(106,85,201,0.32)
banner         0 22px 50px rgba(106,85,201,0.3)
briefRail      0 18px 44px rgba(106,85,201,0.28)
```
CTA buttons get a colored glow: purple `0 8px 20px rgba(106,85,201,0.3)`, amber `0 8px 20px rgba(231,154,60,0.32)`.

### 1.6 Motion

Two keyframes only. Reserve them for hero/feature elements (avatars, floating book covers, hero sparkles) — not general UI.
```css
@keyframes lbTwinkle { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
@keyframes lbFloat   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
```
Buttons lift on hover: `style-hover="{ transform:'translateY(-2px)' }"`. Outline buttons swap to `background:#F6F1FF; borderColor:#8B6DF0`.

### 1.7 Emoji as iconography

Lullabook **uses emoji deliberately** as its icon set — it's part of the warm, friendly voice. Stick to the established vocabulary; don't draw SVG icons.

`☀️` World/brand · `📚` Stories · `✨` Create/illustrated/magic · `💛` Family · `🐻` Characters · `📔` Daily · `⚙️` Account · `🔒` Privacy · `📸`/`⬆️`/`🤳` Photos & upload · `🎙️`/`🔴`/`▶` Voice · `🕒` Schedule · `⭐` "the star" (Maya) · `🌙` Bedtime/cozy · `🚀` Adventure · `😄` Silly/funny · `🌟` Milestone · `🫂` Tough day · `✓` success.

---

## 2. Layout system

- **Page width:** center content in `max-width: 1100–1160px; margin: 0 auto; padding: 30px 22px;`
- **Two-pane screens** (Create, Add Family, Daily, Edit Character): `display:grid; gap:26px; grid-template-columns:1.5fr 1fr;` — main form left, **sticky preview/brief rail right** (`position:sticky; top:90px`). The right rail is usually a gradient panel (briefRail) or a live preview card.
- **Master–detail** (Family): `grid-template-columns:320px 1fr;` — list of rows left, detail card right.
- **Grids** (Stories, Characters): `grid-template-columns:repeat(auto-fill,minmax(196–250px,1fr)); gap:18–22px;`
- **Stack spacing:** vertical sections use `display:flex; flex-direction:column; gap:22px;`
- Always use flex/grid with `gap` for groups of chips/buttons/rows — never bare inline spacing.
- Decorative ambient blobs (optional, on full pages): absolutely-positioned radial gradients at low opacity behind content, e.g. `radial-gradient(circle, rgba(139,109,240,0.14), transparent 65%)`.

---

## 3. Standard chrome

### 3.1 Header (sticky, frosted)
```html
<header style="position:sticky; top:0; z-index:40; backdrop-filter:saturate(1.3) blur(10px);
  background:rgba(251,244,231,0.82); border-bottom:1px solid #F0E6D2;">
  <div style="max-width:1160px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 22px;">
    <!-- wordmark: ☀️ tile (38px, radius 13, ctaPurple gradient) + "Lullabook" in Baloo 2 800 1.5rem -->
    <!-- center nav pill -->
    <!-- right: "✨ Illustrated" gold badge + round avatar -->
  </div>
</header>
```

### 3.2 Nav pill
A rounded-pill container `background:#FFFDF9; border:1px solid #ECE1CE; border-radius:999px; padding:5px;` holding the six items. Each item: `padding:9px 13px; border-radius:999px; font-weight:700; font-size:0.88rem;` Active = `background:#EDE7FE; color:#6A55C9;` Inactive = `background:transparent; color:#6E6076;` Each shows emoji + label. Nav order: World ☀️ · Stories 📚 · Create ✨ · Family 💛 · Characters 🐻 · Daily 📔.

---

## 4. Component recipes

### 4.1 Card (the workhorse)
```
background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px;
padding:22px; box-shadow:0 8px 24px rgba(58,40,80,0.06);
```
Heading inside a card: Baloo 2, weight 700, ~1.15–1.3rem, color `#2E2438`. Divider inside a card: `height:1px; background:#F0E6D2; margin:18px 0;`

### 4.2 Buttons
- **Primary (purple):** `padding:13px 22px; border-radius:999px; border:none; background:linear-gradient(135deg,#8B6DF0,#6A55C9); color:#fff; font-family:'Nunito'; font-weight:800; box-shadow:0 8px 20px rgba(106,85,201,0.3);` hover lift.
- **Secondary (amber):** `background:linear-gradient(135deg,#F6C177,#E79A3C); color:#3a2410;` glow `rgba(231,154,60,0.32)`.
- **Outline / ghost:** `background:#FFF8EC; color:#6A55C9; border:1px solid #ECE1CE;` hover → `background:#F6F1FF; borderColor:#8B6DF0`.
- **Cream (on gradients):** `background:#FFFDF9; color:#6A55C9; box-shadow:0 12px 28px rgba(0,0,0,0.18);`
- **Text link:** `background:none; border:none; color:#6A55C9; font-weight:800;`
- **Destructive:** `border:1px solid #ECCDD2; background:#FFFDF9; color:#B23A48;` hover `background:#FDF1F3`.
- Back links: `‹ Back to …` text link in `#6A55C9`.

### 4.3 Chips & tags
- **Selectable big chip:** `padding:12px 18px; border-radius:999px; border:1.5px solid; font-weight:800;` selected → border `#8B6DF0`, bg `#EDE7FE`, text `#6A55C9`; unselected → border `#ECE1CE`, bg `#FFFDF9`, text `#6E6076`. Usually emoji + label.
- **Small tag/pill:** `padding:4px 11px; border-radius:999px; font-weight:700–800; font-size:0.74–0.8rem.` Color families: purple (`#EDE7FE`/`#6A55C9`), gold (`#FBEBCE`/`#8C611B`), green (`#E1F1E8`/`#3C7556`), rose (`#FCE4EC`/`#9F4A72`), neutral (`#FBF4E7`/`#9A8A78`). (Gold/green/rose text values were darkened in the #224 polish pass so every tag family meets WCAG AA ≥4.5:1 on its background; the neutral family is muted meta text, recorded in the audit.)

### 4.4 Avatar
Circle (or `border-radius:20px` rounded-square for character tiles), filled with an **avatar gradient by index**, white initial in Baloo 2 700. On gradient banners add `border:4px solid rgba(255,255,255,0.5)`. A "the star" badge (`⭐`) can sit bottom-right in a small cream circle.

### 4.5 Inputs
```
width:100%; font-size:1rem; color:#2E2438; background:#FBF4E7;
border:1px solid #ECE1CE; border-radius:14px; padding:13px 15px; box-sizing:border-box;
```
Label above: Baloo 2, weight 700, ~1.05rem, `#2E2438`, `margin-bottom:6px`. Optional hint below: `0.82rem; #9A8A78`. Special inputs (nickname fields) render their value in Baloo 2 colored purple/amber to feel affectionate.

### 4.6 Upload zone
Dashed dropzone: `border:2px dashed #D8C9B0; background:#FFF8EC; border-radius:18px; padding:30px 20px;` centered ⬆️ in a white circle, Baloo 2 prompt in `#6A55C9`, hint in `#9A8A78`. Hover → `borderColor:#8B6DF0; background:#F6F1FF`. Photo slots: `aspect-ratio:1; border-radius:12px;` filled = striped gradient `repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 6px, rgba(255,255,255,0) 6px 12px)` over an avatar gradient; empty add-tile = dashed border + `＋`.

> **Privacy note (ADR-0020):** roster members display a generated **Roster avatar**,
> never their raw uploaded photo. Use avatar gradients + the generated avatar on any
> cosmetic surface; the upload zone is only for the "add / update reference photos"
> flow, not for displaying stored photos back.

### 4.7 Gradient side rail / "why this helps"
`background:linear-gradient(160deg,#6A55C9,#B5739E); border-radius:20–24px; padding:20–24px; color:#fff;` Eyebrow in `#FFE9C9`, body text in `#FBEAF3`. Used for the Create brief and inline encouragement panels.

### 4.8 Book cover
`aspect-ratio:4/5; border-radius:18px; box-shadow:0 12px 28px rgba(58,40,80,0.16);` filled with a **bookSky gradient by index**. Add a glowing moon (small cream circle with blur shadow), a `coverShade` scrim at the bottom, a status pill top-left, and the title bottom-left in Baloo 2 700 `#FAF4E6`. Status pills: Finalized (green), Generating (lilac), Draft (neutral). Floating covers may use `lbFloat`.

### 4.9 Voice panel (the one dark surface)
`background:linear-gradient(160deg,#2A2452,#3E2F63); border-radius:20px; padding:22px; color:#FAF4E6;` Audio row inside: translucent white fill, amber circular ▶ button, waveform of `rgba(185,165,245,0.75)` bars, italic quote in `#D7CBEE`. Record CTA: cream pill with `🔴`.

### 4.10 Status dot
`width:9px; height:9px; border-radius:50%;` ready `#5FB389` · training `#E79A3C` · needs photos `#C9A9A9`. Pair with a 700-weight label.

---

## 5. Page scaffold (copy this to start any new screen)

Every screen opens with an **eyebrow → title → lead** block, then content.

```html
<div style="display:flex; flex-direction:column; gap:22px;">
  <div>
    <p style="text-transform:uppercase; letter-spacing:0.16em; font-size:0.74rem; font-weight:800; color:#8B6DF0; margin:0 0 6px;">⚙️ Section eyebrow</p>
    <h1 style="font-family:'Baloo 2',cursive; font-weight:800; font-size:2.3rem; margin:0; color:#2E2438; letter-spacing:-0.02em;">Page title</h1>
    <p style="margin:6px 0 0; color:#6E6076; font-size:1.02rem; max-width:580px;">One warm sentence of context.</p>
  </div>
  <!-- content: cards / grid / two-pane -->
</div>
```

For sub-screens, prepend a back link: `‹ Back to …` in `#6A55C9`.

---

## 6. Voice & copy

- Warm, parent-to-parent, gently magical. Use the child's name freely ("Maya's world," "everyone who loves her").
- Reassure on anything sensitive — privacy, photos, deletion: "encrypted, private to your family, and never used to train anything but {name}."
- Affectionate microcopy: "Invite someone who loves Maya," "made-up friends are always free," "About 4 minutes to your first pages."
- Em-dashes and lowercase pet names ("moonbeam," "Nani") are on-brand. Keep it cozy, never corporate.

---

## 7. Do / Don't

**Do**
- Start from cream `#FBF4E7`, build with `#FFFDF9` cards, accent sparingly with purple + amber.
- Use Baloo 2 for anything that should feel storybook; Nunito for the rest.
- Keep everything pill-rounded and softly shadowed.
- Give each person/cast member a consistent avatar gradient.
- Use the established emoji vocabulary as icons.

**Don't**
- Don't introduce new hues, pure black/white, or hard gray shadows.
- Don't use sharp corners or thin SaaS-style borders.
- Don't draw custom SVG icons — use emoji.
- Don't make dark surfaces anywhere except the voice panel.
- Don't crowd screens — generous padding (22px cards, 26px grid gaps) and breathing room are the point.

---

*Reference implementation in the repo: `design/lullabook-current-design.html` (full
token swatch sheet). Canonical token values: `src/components/v2/tokens.ts`. Audit any
screen against these tokens with the **lullabook-design-check** skill.*
