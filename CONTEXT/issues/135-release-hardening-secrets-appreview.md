# 135 — Release hardening: secrets audit + Apple App Review prep
Status: shipped
(a) Secrets audit: no secret value in any `EXPO_PUBLIC_*`; dev sim creds (`EXPO_PUBLIC_DEV_PASSWORD`) and all dev overrides (seed/liveness/subscription/`DEV_FAL_FALLBACK`) are inert/absent when `NODE_ENV === "production"`. (b) Apple App Review packet: privacy nutrition labels, consent-flow walkthrough, data-use & deletion docs for Guideline 4.2 (kids/biometric data).
Checklist item that still binds: an automated check proves all dev-override paths inert in release config.
(condensed 2026-07-07 — full spec in git history)
