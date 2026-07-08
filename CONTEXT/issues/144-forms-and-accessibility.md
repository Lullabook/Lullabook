# 144 — Keyboard handling, animated controls & accessibility pass
Status: shipped
Added `KeyboardAvoidingView` to `Screen` for forms (family/new, daily, create, dev sign-in). Animated the billing segmented toggle and consent checkbox (real 44pt targets, spring check). Accessibility pass: ≥44pt hit targets, Dynamic Type (`allowFontScaling`), fixed borderline WCAG-AA contrast (`C.soft` body text on tint).
Invariant: all touch targets ≥ 44×44pt; contrast ≥ WCAG AA; text supports Dynamic Type.
(condensed 2026-07-07 — full spec in git history)
