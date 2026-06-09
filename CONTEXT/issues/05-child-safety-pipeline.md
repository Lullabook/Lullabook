# 05 — Child-safety pipeline (CSAM hash + moderation + NCMEC)

- Type: HITL (vendor access + legal/NCMEC workflow) · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0010

## What to build

Defense-in-depth content safety wired into every upload and every generated
image. Inputs (uploaded photos, free-text Brief, custom style notes) are screened
*before* storage/training; generated images are screened *before* the parent sees
them. Includes the moderation adapter (CSAM hash-match + safety classifiers), an
audit trail, an NCMEC reporting path, abuse reporting, and account bans. The
adapter may be faked in dev/tests, but the real CSAM/NCMEC integration is a
**launch blocker**.

## Acceptance criteria

- [ ] Every uploaded photo passes CSAM hash-match + safety classifier before storage/training; failures blocked + logged.
- [ ] Free-text Brief and custom style notes pass moderation before generation.
- [ ] Every generated image passes a safety classifier before display; failures quarantined/auto-re-rolled.
- [ ] Audit trail records moderation outcomes; NCMEC reporting path exists for detected CSAM.
- [ ] Abuse-report endpoint and account-ban action exist.
- [ ] Real CSAM-hash vendor + NCMEC workflow procured and connected (HITL).

## Blocked by

- 03 — Adult Persona creation (first real upload surface)
