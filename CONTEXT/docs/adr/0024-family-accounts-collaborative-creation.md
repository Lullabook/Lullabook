# 0024 — Family accounts: invited Members and collaborative story creation

- Status: Accepted (2026-06-22)
- Extends: [ADR-0006](0006-family-member-guardian-model.md) (Family/Member/Guardian) —
  adds the invite→accept→link lifecycle and the per-member create boundary.
- Depends on: [ADR-0014](0014-adult-persona-self-consent.md) (adult self-consent +
  liveness), [ADR-0008](0008-verifiable-parental-consent.md) (VPC),
  [ADR-0018](0018-native-ios-app-iap-and-email-plus-vpc.md) (native iOS),
  [ADR-0025](0025-two-plan-monetization.md) (the member-login cap bounds how many may
  join; the create-gate decides who may generate).
- Realizes the case ADR-0014 explicitly **deferred** — "a Persona of another consenting
  adult (e.g. a grandparent who won't make an account)" — by having them *make an
  account* and self-consent.

## Context

The product is "the **Baby's [World](../../CONTEXT.md)** shared by the real family":
grandparents should have their own logins, record voice messages, and create stories for
the baby. The domain already models multiple Members per Family with a Guardian role
(ADR-0006), and an invite/accept primitive already exists in `FamilyService` — **but it
is incomplete**: `acceptInvite` is orphaned (no route, no email, no token/expiry/role on
the invite), it **collides with auto-onboarding** (a new sign-in runs
`ensureFamilyForNewUser` and gets its *own* Family + Guardian role before any invite is
consumed), and there is **no way to link** an invited Member to a pre-existing roster
person. Likeness/voice consent is per-adult-self (ADR-0014), which is exactly why
inviting the real person — who then self-consents — is the right shape, not a parent
uploading someone else's photos.

## Decision

1. **Invitation lifecycle.** A Guardian attaches an **email to a roster person** and
   sends an invite. The invite carries an **opaque single-use token, an expiry, and a
   fixed `member` role** (never an attacker-chosen role). An **acceptance route** consumes
   the token, creates the invitee's Member in the *inviter's* Household (role `member`),
   and **takes precedence over auto-onboarding** so the invitee joins that Household
   rather than getting a fresh solo Family. Email is sent via the existing Resend adapter,
   mirroring the Email-Plus VPC token+confirm pattern.
2. **Self-Persona link.** The accepted Member is linked to their own **Adult Persona**
   (their Self Persona). The persona's likeness still originates from the invitee's **own
   selfie/liveness self-consent** (ADR-0014); linking to a roster entry never bypasses
   liveness.
3. **Collaborative creation, role-bounded.** Any Member of an entitled Household may
   create Stories **subject to the per-member create-rights gate** (ADR-0025): on *Just
   Us* only the Guardian creates; on *Our Whole Family* every Member creates. Guardian-only
   powers are unchanged (create Baby Persona, hard-delete, invite/remove Members, manage
   consent).
4. **Voice contribution.** An Invited Member records a **Voice message**; because they
   self-consent to their own voice, it posts to the Baby's World **immediately** and
   **notifies** the parents, eligible for the lullaby weave / narration right away (no
   approval inbox). Voice is an Our-Whole-Family capability (ADR-0025).

## Why (the trade-off)

- Invite-then-self-consent is the only consent-clean way to put a grandparent's
  likeness/voice in stories; it turns ADR-0014's deferred case into the core feature
  instead of a hack.
- **Immediate-post** (vs an approval inbox) keeps the emotional loop tight; consent is
  satisfied by the recorder being the subject. A Guardian can still remove a Member (and
  their contributions) — the safety valve.
- Reusing Member/Guardian (ADR-0006) + the existing invite primitive makes this
  **additive**, not a new identity system.

## Consequences

- Cross-member **RLS isolation** must hold: an accepted Member sees exactly their
  Household and nothing else (app-layer actor checks are the runtime boundary; Postgres
  RLS is defense-in-depth). Draft Storybooks stay private to their creator.
- The `invites` table gains **token / expiry / role / status**; acceptance rejects
  expired/used/forged tokens.
- The onboarding path must **check for a pending invite** before creating a solo Family.
- The number of Members who may join is bounded by the **member-login cap** of the
  Household's plan (ADR-0025).

## Considered Options

- **Parent uploads Grandma's photos** — rejected: violates ADR-0014 self-consent/liveness.
- **Guardian-approval inbox for voice** — rejected for v13 (friction); revisit if abuse
  appears. Guardian removal is the backstop.
- **Lightweight contributor links (no account)** — rejected: the user wants real shared
  accounts ("their own accounts as a family").
