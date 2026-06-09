# 0011 — Backend architecture: Supabase + dedicated blob storage + durable workflows

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0003](0003-web-first-platform.md), [ADR-0006](0006-family-member-guardian-model.md), [ADR-0007](0007-data-lifecycle-and-deletion.md)

## Context

Solo developer; web-first app; strongly relational domain with strict per-Family
isolation of minors' data; and an async, paid, multi-step generation/training
pipeline driven by fal.ai webhooks where steps fail independently.

## Decision

- **Next.js + Supabase (Postgres).** The relational domain and the need to
  *prove* per-Family data isolation favor Postgres with **row-level security**
  over NoSQL. Supabase bundles Postgres + Auth (Member logins, invites, Guardian
  role) for minimal solo-dev surface.
- **Dedicated encrypted object storage (R2 / S3) for the sensitive blobs** —
  uploaded photos and LoRA weights — rather than the BaaS's storage, so hard-delete
  (ADR-0007) can be provably driven across an explicitly controlled store with
  lifecycle rules.
- **Durable workflow platform (Inngest / Trigger.dev)** for orchestration:
  retryable steps, fan-out across the N per-page image generations,
  `waitForEvent` to park on fal.ai webhooks, and per-step failure isolation that
  maps onto the per-Page candidate model (ADR-0004).

## Consequences

- Two data homes (Postgres for structured data, object storage for blobs) means
  hard-delete must coordinate across both plus backups/CDN — already called out
  in ADR-0007.
- Lock-in to Supabase Auth/RLS semantics and the chosen workflow platform; both
  judged worth it for solo-dev velocity.

## Considered Options

- **Assembled best-of-breed** (Neon + Clerk + R2) — more control, more glue.
- **Firebase/Firestore** — fast start, but NoSQL fights the relational domain
  and makes provable per-Family isolation harder.
- **Bare serverless + webhooks, no orchestrator** — fragile for multi-step
  partial failures.
