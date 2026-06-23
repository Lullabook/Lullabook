# PRD v15 — UI native polish (Apple-grade craft, Maya's World warmth)

> Status: ready for agent. Planning artifact from `/part1` (2026-06-23), from the UI/Apple-
> grade gap audit. Pairs with the [`lullabook-design`](../../.claude/skills/lullabook-design)
> tokens and the `lullabook-design-check` linter. Separate from [PRD v14](prd-v14-r1-release.md)
> (R1 function) — this is **craft, not features**. Visual reference of every current screen:
> [`../ui-snapshots/`](../ui-snapshots/).

## Why this wave

The audit's verdict: the mobile app is a **faithful, consistent** implementation of the
"Maya's World" tokens — but it reads as **a web layout ported to React Native, not a native
iOS app**. It has **zero motion, zero haptics, no touch feedback, no pull-to-refresh** (it
ships a literal `↻ Refresh` button), **flat buttons** (the brand spec actually calls for
gradient + glow, which the port dropped), hand-rolled `.map()` lists, a custom back-pill
instead of native nav, and bare `ActivityIndicator` loading with one-line gray empty states.

**The gap to "Apple-grade" is craft and interaction polish, not a restyle.** The warmth is
right; the *life* is missing. Critically: keep the storybook brand (emoji iconography,
cream/purple/amber, Baloo 2/Nunito are **deliberate** — do **not** swap to SF Symbols or
Apple-minimal). The goal is Apple-level *polish on top of* the warm brand.

## Locked decisions (from the audit + grill)

- **Centralize interaction in `maya-ui`** so every screen inherits polish for free.
- **Restore the brand's intended richness the port dropped** (gradient+glow buttons,
  twinkle/float hero, animated page-turn) — this is on-brand, not Apple-minimalism.
- **Adopt native chrome that doesn't fight the brand:** blurred translucent tab bar and
  `headerLargeTitle` rendered in Baloo 2 (keep storybook type, gain native large-title
  behavior); resolve the duplicate nav-title vs in-content `PageTitle`.
- **Keep emoji** as brand iconography; make it crisper (consistent sizing; animate
  scale/weight for state instead of opacity-dimming). No SF Symbols swap.
- This wave is **mobile-only** and **tier-agnostic**; it changes no domain behavior.

### Track UI-A — Quick wins (mostly in `maya-ui.tsx`; hours)
- **Touch feedback everywhere:** `Pressable` render-prop (opacity ~0.85 + spring `scale(0.97)`
  via the already-installed `react-native-reanimated`) on `PrimaryButton`/`GhostButton`/
  `Chip` and card rows; add `hitSlop`.
- **Haptics:** add `expo-haptics`; `impactAsync(Light)` on primary CTAs / chip toggles / tab
  switches, `notificationAsync(Success)` when a story finishes / training starts.
- **Gradient + glow buttons** via `expo-linear-gradient` (135° purple, amber secondary) —
  the single biggest "feels cheap vs premium" fix.
- **Pull-to-refresh:** `RefreshControl` on the `Screen` scroll view; **delete** the literal
  `↻ Refresh` button (`(tabs)/index.tsx:165`).
- **Fix the billing nested `ScrollView`** (`billing.tsx:143`) that breaks paywall scroll.
- **`BackPill` → 44pt** hit target.
- **Skeleton component:** one reusable shimmer card mirroring final layout; drop into every
  loading branch (replaces bare `ActivityIndicator`).

### Track UI-B — Native chrome & real lists (structural; days)
- **Blurred translucent tab bar** (`expo-blur`) with content scrolling under.
- **`headerLargeTitle` in Baloo 2**; reconcile the dual-title problem (drop in-content
  `PageTitle` on stack screens).
- **Convert hand-rolled lists** (roster, library, journal) to `FlatList`/`SectionList` with
  inset separators + swipe actions; remove manual `.map()` in ScrollViews.

### Track UI-C — Motion, forms & accessibility (polish + correctness; days)
- **Motion system:** reanimated card entrance (`FadeInUp`)/layout, **animated reader
  page-turn** (replace instant `setPageIndex`), and a twinkling hero star / gently floating
  book cover (the `lbTwinkle`/`lbFloat` the brand spec defines but the port never built).
- **Forms:** `KeyboardAvoidingView` in `Screen`; animate the billing segmented toggle and
  the consent checkbox (real 44pt target, spring check).
- **Accessibility pass:** ≥44pt hit targets, Dynamic Type (`allowFontScaling` strategy +
  test), WCAG-AA contrast (fix borderline `C.soft` body on tint), honor reduce-motion.

### Packaging & order
**One PRD, three tracks → one UI PR (planning).** Build order **UI-A → UI-B → UI-C**:
quick wins land the biggest perceived-quality jump first and are low-risk; chrome and motion
build on the centralized components. Issues **136–144**.

## Invariants (acceptance constraints)

### Performance
- All animations run at **60fps** on the UI thread (reanimated worklets); no JS-thread jank.
- Press feedback latency **< 50ms**; pull-to-refresh spinner appears within one frame.
- Skeletons render **immediately** on mount (no flash of blank/`ActivityIndicator`).

### Failure modes
- **Haptics unavailable** (older sim / setting off) → no-op, never throws.
- **Reduce-motion** accessibility setting on → animations degrade to instant/crossfade.
- Gradient/blur libraries absent at runtime → graceful fallback to the current flat token
  (never a red-screen — cf. the expo-av lesson).

### Brand / accessibility boundaries
- Every changed screen **passes `lullabook-design-check`** (tokens, type, radius, shadow).
- **Emoji iconography is retained** (no SF Symbols); warmth/identity unchanged.
- Hit targets **≥ 44×44pt**; text supports **Dynamic Type**; contrast **≥ WCAG AA**.
- **No domain/behavior change** — this wave is presentation only; API calls, navigation
  destinations (see `ui-snapshots/NAVIGATION.md`), and gates are untouched.

## Tracks → issues

| Track | Issues | Theme |
|-------|--------|-------|
| **UI-A — Quick wins** | 136–139 | press feedback+haptics · gradient buttons · pull-to-refresh · skeleton · billing scroll fix |
| **UI-B — Native chrome & lists** | 140–142 | blurred tab bar · large titles · FlatList/SectionList |
| **UI-C — Motion, forms, a11y** | 143–144 | motion + animated page-turn · keyboard + animated controls · accessibility pass |

Each issue ships a runnable `Verification-command` (typecheck + `lullabook-design-check`) so
`/part2`'s maker→checker loop has a real gate. The handoff names the start issue (**136**).
