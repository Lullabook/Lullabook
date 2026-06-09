# 11 — Family invites & multi-Member

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0006

## What to build

A Guardian can invite other adults as Members of the Family and remove them.
Every Member can use every Persona in the Family; each Member can link a Self
Persona so their account is personalized. Stories are owned by their creating
Member; finalized Storybooks are visible Family-wide (per 10), drafts are
creator-private.

## Acceptance criteria

- [ ] A Guardian can invite a Member (email invite) and remove a Member.
- [ ] Only a Guardian can invite/remove; non-Guardians cannot.
- [ ] An invited Member can create their own Adult Persona and link it as their Self Persona.
- [ ] A Member's new Story defaults to featuring their Self Persona + chosen Personas.
- [ ] Story ownership and Family-wide visibility of finalized books are enforced (tests).

## Blocked by

- 04 — Baby Persona creation
