# R1 Market Legal-Review Checklist

> Launch gate for PRD v14 / issue 130. Each enabled R1 market must clear this
> checklist before its `enabled` flag is set to `true` in
> `src/services/consent-engine.ts`. R1 ships **US + IN** (Asia); KR/SG/JP stay
> `enabled: false` (fast-follow R1.1). Adding a market is a **config-only**
> change (new `JURISDICTIONS` entry) once its checklist is signed.

## Per-market checklist

For each market (`US`, `IN`, …), confirm and record the reviewer + date:

### US (notice: `us-coppa-v1`, residency: `us-east-1`, consent: `payment_vpc` web / `email_plus` iOS)

- [ ] COPPA verifiable-parental-consent method confirmed for the surface
      (web = payment VPC; iOS = Email-Plus VPC per ADR-0018).
- [ ] Child-age threshold (13) reviewed against current COPPA definition of
      "child."
- [ ] Data-residency region (`us-east-1`) confirmed with infra.
- [ ] Privacy notice version (`us-coppa-v1`) matches the live notice text.
- [ ] Retention + hard-delete (ADR-0007) reviewed for US requirements.
- [ ] Apple App Review (Guideline 4.2 — kids/biometric) disclosures drafted.

### IN (notice: `in-dpdp-v1`, residency: `ap-south-1`, consent: `payment_vpc`)

- [ ] DPDP Act verifiable consent method confirmed.
- [ ] Child-age threshold (18) reviewed against DPDP "child" definition.
- [ ] Data-residency (`ap-south-1`) + cross-border transfer rules reviewed.
- [ ] Privacy notice version (`in-dpdp-v1`) matches the live notice text.
- [ ] Retention + hard-delete reviewed for DPDP requirements.
- [ ] Consent-receipt storage + revoke-to-purge path audited.

## Adding a market (R1.1+)

1. Add a `JURISDICTIONS[code]` entry in `consent-engine.ts` (consent method,
   child-age, residency, notice version, `enabled`).
2. Complete the per-market checklist above; record reviewer + date.
3. Set `enabled: true` only after the checklist is signed.
4. No code change beyond the config entry — the engine resolves every value
   from the table (pinned by `tests/130-jurisdiction-asia-us.test.ts`).

## Sequencing risk (from PRD v14)

Asia+US multi-jurisdiction is the R1 long pole. If it threatens the date,
sequence US-first (R1.0) and Asia fast-follow (R1.1) — the config-driven engine
makes that a data change, not a rebuild.
