# 103 — Mobile nav: nested stack-in-tab so tabs persist (kill the Redirect shims)

Status: shipped

Fixed 3 of 5 tabs (`stories.tsx`, `create.tsx`, `settings.tsx`) being `<Redirect>` shims
that jumped out of the `(tabs)` navigator to root-stack siblings, dropping the tab bar
and losing tab selection. Restructured each tab to own a nested Stack (e.g.
`(tabs)/stories/_layout.tsx` + index/[id]), moved target screens under their tab, deleted
the shims.
Invariant: tapping any tab lands within `(tabs)`, tab bar/highlight persist, drill-downs
keep the tab bar mounted.

(condensed 2026-07-07 — full spec in git history)
