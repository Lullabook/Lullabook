# 97 — Baby-hero Home dashboard + context-engine nudge

Status: shipped

Shipped the health-app-style Home: baby-World hero + single primary CTA, plus four cards
(Continue reading, context-engine Story nudge from issue 89, this-week/streak, Family
activity); nudge degrades to a friendly default when the context engine has nothing
notable. Home (incl. nudge) must load p95 <1s; renders no raw uploaded photo, only
generated avatars/illustrations (ADR-0020/0021).
Since issue 89 (the nudge's context engine) was later gated off for R1 (148), the nudge
card now always shows its friendly default — the dashboard itself is unaffected.

(condensed 2026-07-07 — full spec in git history)
