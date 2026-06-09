# 0001 — Photo-conditioned likeness from day one

- Status: Accepted
- Date: 2026-06-09

## Context

The core emotional hook of the product is that a Story stars *the family's own
baby*, not a generic infant. Illustrations must resemble the real child across
every page and across future stories (the consistency problem).

Three options were weighed:
1. **Stylized avatar** — parent builds a cartoon avatar from trait menus. No
   photos, zero biometric risk, perfectly consistent, but never looks like the
   *specific* child.
2. **Photo-conditioned** — parent uploads baby/parent photos; illustrations are
   conditioned on them to resemble the real people.
3. **Described likeness** — text traits only; simple but drifts page-to-page and
   never nails a specific person.

## Decision

We use **photo-conditioned likeness from day one** (option 2). A Persona is
anchored on uploaded reference photos of a real person.

## Consequences

- **Positive:** Strongest emotional hook and product differentiation; the real
  "my baby is in this book" moment is present from v1.
- **Negative / obligations (load-bearing from the first upload):**
  - We store and process **biometric data of minors**. Consent capture, a real
    privacy policy, encrypted-at-rest storage, and deletion-on-request are v1
    requirements, not later cleanup.
  - **COPPA** (US, data about under-13s; consent is the *parent's*, the data is
    the *child's*) and **GDPR** (if any EU users; biometric = special category)
    apply.
  - Photo storage, retention windows, and a hard-delete path must exist in v1.
- This decision is hard to reverse because the entire Persona data model, the
  image-generation pipeline, and the legal posture are built around it.

## Revisit if

- Legal/cost burden of minors' biometric data proves untenable for a solo side
  project → fall back to stylized-avatar v1 with photo as opt-in premium.
