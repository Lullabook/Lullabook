# 0007 — Data lifecycle: minimization, export-on-cancel, always-on hard-delete

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0006](0006-family-member-guardian-model.md)

## Context

We store biometric data of minors (Baby Persona photos + LoRA weights), personal
metadata (names, birthdates), engineered Prompts that embed personal traits, and
generated Storybooks. COPPA and GDPR impose data-minimization, retention limits,
and a right to erasure. This collides with the keepsake instinct to host a
parent's treasured books forever. We resolve it in favor of minimization, and
keep the keepsake promise via local export rather than indefinite hosting.

## Decision

- **Data minimization is the default.** Store the minimum data for the minimum
  time needed to provide the service.
- **Always-on right to be forgotten.** A Guardian can trigger an immediate,
  total hard-delete of the Family's data — photos, LoRA weights, Prompts,
  Persona metadata, and generated Storybooks — at any time, not only at
  cancellation. This is ADR-0001's mandated hard-delete path made concrete.
- **Cancellation → export-then-purge.** On cancel the account becomes read-only
  for a **30-day export window** with reminders to download finalized Storybooks
  as **PDF**. At window end, hard-delete: uploaded photos, LoRA weights,
  engineered Prompts, Persona metadata, and hosted Storybooks. The account moves
  to **inactive**, retaining only billing/tax records strictly required by law.
- **The keepsake is the exported PDF on the parent's device**, not a hosted
  artifact.
- **No cloud locker in v1.** Hosting churned users' books (even anonymized)
  needs separate explicit, revocable consent; defer past v1.

## Consequences

- Hard-delete must **propagate to every store**: object storage (photos, book
  images), the LoRA weights store, the database (metadata, Prompts), and any
  backups/caches/CDN. A delete that misses the LoRA weights or a CDN copy is a
  compliance failure — this constrains the storage architecture.
- A long-lapsed returning parent may need to re-train a Persona. Accepted.
- Export (PDF generation) is a first-class, always-available feature, not an
  afterthought.

## Revisit if

- Demand for a persistent, consent-based "cloud locker" of finished books is
  strong enough to justify the extra consent + anonymization machinery.
