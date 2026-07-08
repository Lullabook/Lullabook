# 12 — Hard-delete & cancellation purge

Status: shipped
Guardian-triggered immediate hard-delete of all Family data, propagating across Postgres, blob storage, caches/CDN, and backups — available any time, not just at cancellation. On cancel: 30-day read-only export window with reminders, then automatic purge; account → inactive, retaining only legally-required billing records. Base invariant later extended to cover new data types (voice, moments, native push) without changing the mechanism.
(condensed 2026-07-07 — full spec in git history)
