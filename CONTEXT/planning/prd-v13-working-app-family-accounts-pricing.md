# PRD v13 — Working generation, family accounts & a polished mobile app

> Status: ready for agent. Planning artifact from `/part1` (2026-06-22). **Opens with
> ADRs, not code** — [ADR-0024](../docs/adr/0024-family-accounts-collaborative-creation.md)
> (family accounts) + [ADR-0025](../docs/adr/0025-two-plan-monetization.md) (two-plan
> monetization, supersedes ADR-0023). Research inputs: six 2026-06-22 code-tracing agents
> (generation stall, mobile nav, voice/journal, family/camera, invitations, monetization)
> + two unit-economics/market agents. Driven by hands-on iOS-Simulator testing of the v12
> build.

## Why this wave

The v12 UI shipped, but live Simulator testing showed the app doesn't yet *work* or feel
finished:

1. **Stories never finish.** Generation strands at "Illustrating" forever — the "never
   strand in `generating`" backstop exists only on the Inngest path, not the local-dev
   adapter the app actually runs, so any throw leaves the book non-terminal and the reader
   polls a spinner indefinitely.
2. **Navigation isn't real.** 3 of 5 tabs are `<Redirect>` shims that drop you *out* of
   the tab navigator (tab bar vanishes, selection never sticks), and there is **no in-app
   back button** anywhere — only the bare native iOS chevron.
3. **The family isn't in the app.** The Voice backend and the Journal/"daily life" loop
   already exist in code but aren't reachable, and there's no way to invite the real
   family (grandparents) to participate.
4. **Monetization doesn't match the product.** Basic/Normal/Plus doesn't express "the
   Baby's World shared by the family."

This wave makes the app **work**, feel **Apple-grade**, bring in the **whole family**, and
**price it right**.

## Locked decisions (from the grill)

### Track A — "It actually works" (correctness + mobile polish)
- **Generation always reaches a terminal state.** Move the "never strand in `generating`"
  backstop *into the service* so it holds on every workflow adapter (not just Inngest).
  When illustration is unavailable, a book degrades to a **text-viewable draft**; the
  reader surfaces failed/timed-out books instead of an infinite "Illustrating" spinner,
  and the generate POST error is no longer swallowed.
- **Real navigation.** Nested **stack-in-tab** so the tab bar persists and the selected
  tab sticks (delete the Redirect shims). A **branded in-app back affordance** (Maya UI),
  not the bare native chevron. **Billing becomes a reachable modal** (`presentation:
  "modal"`, wired from the upgrade CTAs).
- **Daily-life is a first-class destination.** The Journal screen (`mobile/app/daily.tsx`)
  already exists and works — surface it properly in the IA instead of burying it behind
  one Home card.
- **Simulator testability.** A **dev-only seed** reachable from the app, plus a
  **camera-free real-upload** path (photo-library reference photos + a dev liveness bypass
  + a persona-training dev fallback so a persona reaches `ready` without live fal keys) so
  a single tester can add real family members and watch the likeness flow. Use
  **free-use / synthetic faces, not real celebrities** (publicity-rights note). All
  dev-only paths are **double-gated** (`NODE_ENV !== "production"` AND an explicit flag),
  exactly like `DEV_FORCE_SUBSCRIPTION`.

### Track B — "The whole family" (accounts + voice) — ADR-0024
- **Invite by email.** Attach an email to a roster person → Guardian sends an invite
  (opaque single-use token, expiry, fixed `member` role) → invitee accepts, becomes a
  non-Guardian Member in the Household linked to their own Adult Persona (self-consent,
  ADR-0014). Completes the orphaned `acceptInvite` and fixes the onboarding collision.
- **Voice on mobile.** A voice **API route** over the existing `VoiceClipService`; a
  mobile **family-member detail screen** with **record → consent → transcript → attach**;
  lullaby/narration **playback in the reader**. A recorded Voice message posts immediately
  + notifies parents.
- Invited-member powers are role-bounded; *create-rights* come from the plan (Track C).

### Track C — "Pricing" — ADR-0025 (supersedes ADR-0023)
- **Two plans:** **Just Us** ($9.99/mo, $79.99/yr — one creator, view-only invitees, no
  voice/video) and **Our Whole Family** ($24.99/mo, $199.99/yr — everyone creates, voice +
  video). Voice/video are the Family-only hook; video stays credit-metered.
- **New primitives:** a **member-login cap** (distinct from the likeness cap) and a
  **per-member create-rights gate**. **Enforce the monthly Story cap** at generation
  (currently computed but never enforced) and **persist the credit ledger** (currently
  in-memory).
- 7-day card-on-file trial of the full experience, annual pre-selected.

### Packaging & order
- **One PRD, ADRs first, three tracks → three PRs.** Build order **A → B → C** (A unblocks
  a usable & testable app; C's create-gate depends on B's invited Members). Issues
  **100–121**.

## Invariants (acceptance constraints — the PASS/FAIL contract)

### Latency / performance
- Generation reaches a terminal state within a bounded **watchdog budget** (claude-pass +
  N pages × per-page budget; default ≤ ~5 min) or is marked `failed` — never open-ended.
- Mobile tab switches and back are **instant** — the `<Tabs>` navigator never unmounts on
  a tab press.
- Entitlement / create-rights check **< 300 ms**, server-side, never blocks UI render.
- Voice upload bounded (max length/size); playback starts **< 1 s** from cache.

### Failure modes
- **Generation throw on ANY adapter** → book ends `failed` (or text-viewable `draft`); the
  reader shows a terminal state, **never an infinite "Illustrating"**; the POST error is
  surfaced, not swallowed.
- **Illustration / blob store unavailable** → text-viewable draft, not uniformly `failed`.
- **fal / RevenueCat / Resend down** → graceful degrade + retry; dev fallbacks let the
  Simulator reach `ready`/terminal without live keys.
- **Invite token expired / used / forged** → rejected; onboarding **never** silently
  creates a solo Family for an invitee with a pending invite.
- **Voice / likeness** → an invited member's persona still passes self-liveness; linking
  to a roster entry never bypasses it.
- **Cap / credit exhaustion** → a clear "N/N used, resets DATE / upgrade" state; a
  **failed** video/train **refunds** the credit; never a dead end, never a charge for a
  failed generation (idempotent — ADR-0011).

### Security / permission boundaries
- Entitlement, plan, login-cap, and **create-rights are server-authoritative**; client UI
  is UX only; **dev seed / liveness / subscription overrides are inert in production**
  (double-gated, server-authoritative).
- **Cross-member RLS isolation:** an accepted Member sees only their Household; draft
  Storybooks stay private to their creator.
- **Guardian-only:** invite/remove Members, create Baby Persona, hard-delete, manage
  consent. An invited Member never gains Guardian powers.
- Apple IAP entitlement is **Household-level** (inherited on login), never per-seat;
  Email-Plus VPC still gates Baby Persona on iOS.

## Tracks → PRs → issues

| PR | Track | Issues | ADR |
|----|-------|--------|-----|
| **PR 1** | A — It actually works | 100–108 | — |
| **PR 2** | B — The whole family | 109–115 | ADR-0024 |
| **PR 3** | C — Pricing | 116–121 | ADR-0025 |

Each issue ships a runnable `Verification-command` (its machine-checkable done-condition)
so `/part2`'s maker→checker loop has a real gate. The handoff names the start issue.
