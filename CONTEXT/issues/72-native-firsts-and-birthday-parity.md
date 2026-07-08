# 72 — Native iOS parity: Firsts + Birthday offers

Status: shipped

Ported the Firsts view + instant offer (67) and Birthday Story offer (68) to iOS,
reusing the same backend suggestion seam/offer endpoints — no mobile-specific suggestion
logic. Native push for these offers explicitly out of scope. Invariant carried forward:
neither offer ever triggers generation without an explicit parent confirm of Story Type
— never silent spend. This is the surviving (native) home of the 67/68 web features
after the mobile-only pivot.

(condensed 2026-07-07 — full spec in git history)
