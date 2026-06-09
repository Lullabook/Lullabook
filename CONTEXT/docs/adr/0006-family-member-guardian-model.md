# 0006 — Family / Member / Guardian account model

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md)

## Context

We want a shared, multi-login experience: grandma, dad, and mom each have their
own account, all share the same Persona roster, and each account is personalized
to its owner's likeness (grandma's stories star grandma + baby). But the baby's
photos are biometric data of a minor, and COPPA requires consent from the
child's *legal guardian* — so "any member can do anything with the baby's data"
is not legally tenable.

## Decision

Model accounts as **Family → Members**, with a privileged **Guardian** role:

- A **Family** is the shared container that owns the Persona roster, and is the
  unit of data ownership and the **COPPA consent boundary**.
- A **Member** is a human login in a Family. Every Member can *use* every Persona
  in the Family. Each Member may link a **Self Persona** (their own Adult
  Persona) for personalization. Stories are owned by their creating Member.
- A **Guardian** is the accountable role. **Only a Guardian may create a Baby
  Persona** (the act that captures consent), invite/remove Members, and
  hard-delete the child's data. Any Member may create their own Adult Persona
  (self-consent to one's own likeness).

## Consequences

- **Positive:** Delivers the personalized multi-login family experience while
  pinning COPPA accountability to one identifiable adult and controlling who can
  access the child's biometric likeness (via Guardian-controlled invites).
- **Negative / accepted:** More than a single-user account — requires Family
  membership, invitations, a role check on Baby Persona creation, and per-Member
  Story ownership. This is a deliberate v1 scope increase over single-login.

## Considered Options

- **Single Guardian per account, one login** — simplest; rejected because it
  loses the shared, personalized multi-member family experience that was wanted.
- **Flat Family (any Member can do anything)** — rejected: no accountable
  guardian for a minor's biometric data.
