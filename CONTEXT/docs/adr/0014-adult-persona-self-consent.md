# 0014 — Adult Personas are self-only, gated by liveness match

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0006](0006-family-member-guardian-model.md), [ADR-0008](0008-verifiable-parental-consent.md)

## Context

ADR-0006 lets any Member create an Adult Persona as "self-consent to one's own
likeness." But nothing in that wording prevents uploading photos of a
*non-consenting* adult — an ex, a celebrity, a neighbor — which is a
right-of-publicity / GDPR / deepfake-harassment problem for a product that
generates images of identifiable people.

## Decision

An **Adult Persona must be the person creating it**:

- At creation, a **selfie/liveness capture** is matched against the uploaded
  reference photos; if they are not the same live person, reject.
- Plus an explicit **consent attestation** backed by ToS.
- **Defer** creating a Persona of *another* consenting adult (e.g. a grandparent
  who won't make an account) — that needs its own verifiable-consent invite flow.

This gives the two Persona kinds distinct consent mechanisms:
**Baby Persona** → Guardian role + payment-VPC ([ADR-0008](0008-verifiable-parental-consent.md));
**Adult Persona** → creator liveness-match (this ADR).

## Consequences

- Adds a selfie/liveness step to adult onboarding (friction accepted).
- A family cannot, in v1, include an adult who refuses to sign up.
- Requires a liveness/face-match capability (vendor or library) before launch.

## Considered Options

- **Attestation-only (ToS checkbox)** — frictionless but unenforceable.
- **Other-adult invite-consent flow** — flexible but a whole second consent
  system; deferred.
