# 167 — Billing plan-toggle slider balance (Annual/Monthly label no longer clipped)

Status: shipped

Fixed the unbalanced Annual/Monthly segmented control on `mobile/app/billing.tsx`: segments now
size to content (equal-width flex or pill sized to widest label), active pill fully contains
"Annual (save 17%)" with no horizontal clipping at any supported width, even touch targets.
Copy fits at smallest supported device width without truncation. Canon tokens
(`lullabook-design`); `lullabook-design-check` passes on `billing.tsx`.

(condensed 2026-07-07 — full spec in git history)
