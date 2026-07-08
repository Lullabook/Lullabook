# 104 — Branded in-app back affordance + custom headers

Status: shipped

Fixed the absence of any in-app back button (every pushed screen relied on the bare
native iOS chevron). Added a Maya-UI header/back-pill component guarded by
`router.canGoBack()`, applied to all pushed screens, built on `lullabook-design` tokens.

(condensed 2026-07-07 — full spec in git history)
