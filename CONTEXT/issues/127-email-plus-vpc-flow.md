# 127 — Email-Plus VPC flow (gates Baby Persona on iOS)
Status: shipped
Verifiable Parental Consent: guardian attests guardianship + enters email → notice-versioned single-use consent link → guardian confirms → Family flagged `consent_verified` + consent receipt (who/when/notice version) stored → delayed revoke email.
Invariant: Baby Persona creation is server-gated on `consent_verified` (Apple IAP can't prove payer identity, so card-on-file ≠ consent on iOS). Revoke clears `consent_verified`, blocks new personas, routes existing child data to purge (ADR-0007). Email-send failure → consent not granted, retryable.
(condensed 2026-07-07 — full spec in git history)
