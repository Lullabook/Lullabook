# Session Handoff — 2026-06-12 (session 2): native iOS planning + code review

Status: historical

Planning session, no app code: code review of the productionization diff surfaced
8 real shared-service bugs (promotion kind, hard-delete PII, failed-book recovery,
re-roll moderation bypass, stranded training persona, pageRecover terminal handler,
non-numeric moderation score, sync round-trips — all later fixed, see
SESSION-HANDOFF-2026-06-13-BUGS-FIXED.md); wrote ADR-0018 and
`docs/FABLE-NATIVE-IOS-ONESHOT-PROMPT.md`.

- Binding (ADR-0018): native Expo/React Native app (not WebView) over the existing backend; Next.js stays as backend + web surface; no forked domain logic.
- Binding: iOS billing = Apple IAP via RevenueCat (Stripe stays on web); iOS parental consent = Email-Plus VPC, decoupled from IAP (Apple IAP can't prove parental identity, so ADR-0008 payment-as-consent breaks on iOS).

(condensed 2026-07-07 — full text in git history)
