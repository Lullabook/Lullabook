# 207 — Create the five-Persona roster behind two minor and three adult consent flows

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Create the real Family roster atomically: a 3-year-old daughter and a 14-year-old brother as minors, and a 43-year-old father, 38-year-old mother, and 27-year-old brother as adults. Each minor needs its own verified parental consent receipt. Each adult needs its own self-consent. Moderation runs before any durable photo persistence.

## Acceptance criteria

- [ ] Creating either minor's Persona without that specific minor's own consent receipt is rejected, and one minor's receipt never satisfies the other (`SEC-2`).
- [ ] Whether a person is a minor is read from the configured child-age threshold for the Family's jurisdiction; no age and no threshold is hardcoded (`SEC-8`).
- [ ] With the threshold configured to 18 the 14-year-old routes to verified parental consent, and with it configured to 13 the same person routes to adult self-consent, with no code change (`SEC-8`).
- [ ] A minor's consent receipt records the consenting adult's identity, and that adult is the account-holding parent (`SEC-9`).
- [ ] An Adult Persona is rejected when the subject's self-consent is absent, and a Guardian attestation is never accepted in its place (`SEC-3`).
- [ ] A source photo is moderated before it is durably persisted or sent to a provider, and a rejected photo leaves no owned blob (`FAIL-9`).
- [ ] A rejected creation leaves no partial rows and no partial blobs; person, bonds, and Persona are created in one transaction.
- [ ] The roster response returns generated avatars, never a raw uploaded source photo (`SEC-7`).
- [ ] Row-level security denies a second Family read access to every row created here (`SEC-5`).
- [ ] A five-Persona roster read returns p95 under 500ms with a payload under 500KB (`LAT-7`).

## Verification-command

```bash
npx vitest run tests/207-five-persona-consent-roster.test.ts && npm run verify
```

## Blocked by

206

## Invariants restated

SEC-2, SEC-3, SEC-5, SEC-7, SEC-8, SEC-9, FAIL-9, LAT-7

## Notes

Two independent minor flows at the demo threshold of 18. Do not implement consent per Family, and do not hardcode the threshold: ADR-0015 makes it per-jurisdiction configuration. Launch jurisdictions are Australia, Canada, the United States, and the United Kingdom.

**Target backend:** Vercel.
