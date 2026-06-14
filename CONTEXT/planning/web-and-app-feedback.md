# Web App & App Feedback

A running log of concrete UI/UX feedback from real local runs of the app. Each
item is a small, verifiable fix. Captured during planning so the next
implementation pass can fold them in. Newest at the bottom.

> These are **display/polish** items, not new behaviour. Where they touch the
> roster, they must respect [ADR-0020](../docs/adr/0020-roster-avatar-generated-not-raw-photo.md)
> (never render the raw uploaded photo).

---

## 2026-06-14 — first paid/free comparison run

### Web app

1. **Create page — inconsistent font.** The Create page mixes typefaces; the text
   should use one consistent font family across the whole page. Consistency is the
   point — match the rest of the app's type scale.
   - Surface: `src/app/(app)/stories/new` (and/or `storybooks/new`).
   - Done when: every text element on the Create page renders in the app's standard
     font; no stray/default system font remains.

2. **World tab — "What happened today" low contrast.** On the World tab, the
   "What happened today?" capture card (the [Daily nudge]) renders its text in a
   color too close to the card/background, so it's hard to read.
   - Surface: World home Daily-nudge card (`src/app/(app)/world` / the daily-nudge
     component).
   - Done when: the nudge text meets a legible contrast ratio against its
     background (target WCAG AA, ≥ 4.5:1 for body text).

### App (native iOS)

_None logged yet — add items here as they surface from simulator/TestFlight runs._

[Daily nudge]: ../CONTEXT.md
