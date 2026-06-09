# 12 — Hard-delete & cancellation purge

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0007

## What to build

Always-on right to be forgotten: a Guardian can trigger an immediate, total
hard-delete of the Family's data — and it provably propagates across every store
(Postgres, object storage for photos/LoRA weights/book images, caches/CDN,
backups). Plus the cancellation flow: on cancel, the account goes read-only for a
30-day export window with reminders, then the same purge runs automatically;
account becomes inactive, retaining only legally required billing records.

## Acceptance criteria

- [ ] A Guardian-triggered hard-delete removes all Family data; an integration test asserts nothing remains in DB or (faked) blob store afterward.
- [ ] Hard-delete is available at any time, not only at cancellation.
- [ ] On cancel, a 30-day read-only export window starts with reminders.
- [ ] At window end, the purge runs automatically; account → inactive; only billing/tax records retained.
- [ ] Deletion propagation covers photos, LoRA weights, Prompts, metadata, and hosted books.

## Blocked by

- 04 — Baby Persona creation
- 09 — Export PDF (export-before-purge)
