# 0008 — Payment-transaction as verifiable parental consent (VPC)

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0006](0006-family-member-guardian-model.md), [ADR-0007](0007-data-lifecycle-and-deletion.md)

> ⚠️ Engineering design intent, not legal advice. The COPPA/GDPR posture around
> minors' biometric data must get a lawyer's sign-off before launch.

## Context

COPPA requires verifiable parental consent before collecting a minor's personal
information. The FTC recognizes a **monetary (credit-card) transaction** as a
valid VPC method. Lullabook already charges a subscription via Stripe, so the
paywall can double as the consent-verification mechanism.

## Decision

A Guardian cannot upload a minor's photos (create a **Baby Persona**) until:

1. They hold an **active paid subscription** — the card transaction is the
   FTC-recognized VPC method; **and**
2. They affirmatively consent at the point of upload via a **clear notice**
   stating what is collected (photos, name, birthdate), how it is used (LoRA
   training, illustration), and who processes it.

We store a **consent receipt** (who, when, which notice version) to prove
consent. **fal.ai and Anthropic are treated as data processors under DPAs**, not
independent third-party recipients, keeping the child's data within consent
scope.

## Consequences

- **There is no free tier that touches a child's photos** — you must be a paying
  subscriber to create a Baby Persona. This aligns with the subscription model
  (ADR-0009 / stack.md) rather than fighting it.
- A signed **Data Processing Agreement** with each vendor (fal.ai, Anthropic) is
  a launch prerequisite, not optional.
- The consent-receipt store is itself sensitive and subject to the deletion
  policy in [ADR-0007](0007-data-lifecycle-and-deletion.md).

## Considered Options

- **Email-plus** — lowest friction; rejected as legally insufficient once a
  minor's data is shared with processors.
- **Government-ID / signed form** — strongest; rejected as funnel-killing
  friction for a consumer app.
