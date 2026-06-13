# 35 — Family roster (Persona → Family member) + per-baby relationships

## What to build
Rename the user-facing **Persona → Family member**; the internal likeness model
(ADR-0001/0002) stays, now attached to a Family member. Add **relationship** and the
two nicknames (what the baby calls them / what they call the baby) as **per baby–person
pair** data. Roster is shared across a Household's babies by default.

## Acceptance criteria
- Family master-detail (real data): list + detail with relationship + both nicknames + photo count + status.
- Relationship/nicknames stored per (baby, person); editing one baby's pair doesn't change another's.
- Existing Persona likeness/training flow still works under the new name.

## Blocked by
34
