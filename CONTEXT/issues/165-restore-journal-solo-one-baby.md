# 165 — Restore the Journal (solo, one Baby) — un-cut

Status: shipped

Per ADR-0026: restored the Journal over the existing Moments API, solo/one-Baby scope only.
Flag `EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED=true` set (confirmed in mobile/.env), mirrored
server-side in `src/lib/r1-config.ts`, making Moments create/list reachable. Per-Baby Journal
surface reachable from World-home Journal card: Moment timeline newest-first, log free text +
date + optional `significant ✨`, empty-state when none — Firsts/weekly/Birthday suggestions
stayed cut. Binding invariant (critical, I2.4): generation never depends on Moments —
`isR1JournalMachineryEnabled()` only gates auto-context injection in
`runGenerationBodyInner`; a book with zero Moments still generates.

(condensed 2026-07-07 — full spec in git history)
