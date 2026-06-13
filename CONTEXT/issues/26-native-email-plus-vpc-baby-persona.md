# 26 — Email-Plus VPC + Character→Baby Persona promotion + first illustrated Storybook

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD
- **This is the App Store submission point — first paid value (the core pitch).**

## What to build

The first paid, end-to-end illustrated path. A Guardian completes **Email-Plus
VPC** (a payment-independent consent flow), then promotes their free **Character**
into a **Baby Persona** by adding photos via the native camera/library — gated on
an **active Subscription AND completed Email-Plus VPC** — and generates an
**illustrated Storybook** starring their baby, watching **live progress** as Pages
stream in.

Email-Plus VPC state machine: Guardian enters email + attests guardianship →
backend emails a **version-stamped** consent link (via the existing Resend
adapter) → Guardian opens it, sees exactly what is collected (baby photos →
biometric LoRA) and confirms → Family flagged `consent_verified` with a
version-stamped **Consent receipt** → a **delayed second confirmation email with a
revoke link** is sent (the "plus"). New `ConsentMethod` value `email_plus`, added
as a configurable per-Jurisdiction method to the consent engine.

Photo upload rides the **same moderation-first pipeline** as the web upload path
(moderate bytes before any persist; CSAM escalates to HITL/NCMEC) and triggers the
existing `persona-create` Inngest flow; a **likeness-confirmation** review
precedes investing in a full book.

## Acceptance criteria

- [ ] Guardian can run Email-Plus VPC: `requested → link_sent → confirmed`; on
      confirm, a **version-stamped Consent receipt** is written and the Family is
      flagged `consent_verified`; a **delayed confirmation/revoke email** is sent.
- [ ] `email_plus` is a configurable per-Jurisdiction consent method; **Baby
      Persona creation is blocked** until `email_plus` is confirmed where the
      (faked) Jurisdiction requires it, and **allowed** once confirmed.
- [ ] Baby Persona creation additionally requires an **active Subscription**;
      Adult Persona (self + liveness) and Character light attestation are
      unchanged.
- [ ] A parent can **promote a Character into a Baby Persona** by adding photos via
      native camera/library; bytes pass the **moderation-first** pipeline before
      any persist; CSAM escalates to HITL/NCMEC.
- [ ] **Bug fix (promotion `kind`):** promoting a **baby** Character **through the
      workflow** yields a Baby Persona (not hardcoded `adult`); `kind` is threaded
      through the promote payload — tested **via the workflow**, not by bypassing
      it.
- [ ] **Bug fix (stranded persona):** a failed persona-create flips the Persona out
      of `training` (no permanent `training` strand).
- [ ] A **likeness-confirmation** review step lets the parent accept or re-train
      before a full book.
- [ ] A parent generates an **illustrated Storybook** starring the Baby Persona and
      sees **live progress** by polling `GET /api/storybooks/[id]` (Bearer-authed).
- [ ] Tested at the service/route seam with Resend, fal.ai, moderation, and blob
      store faked; prior art `02-subscription-consent`, `03-adult-persona`,
      `06-generate-storybook`.

## Blocked by

- [24 — Free Character tier](./24-native-free-character-text-tier.md)
- [25 — Subscription: RevenueCat IAP](./25-native-subscription-revenuecat-iap.md)
