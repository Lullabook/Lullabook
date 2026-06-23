# R1 Release — Locked Decisions & Invariants

> Grilled 2026-06-23 (hands-on Simulator session + 3-agent research fan-out: ground-truth
> implementation audit, R1-scope analysis, UI/Apple-grade gap audit). This doc is the
> invariants gate for the R1 planning chain. Feeds **PRD v14 (R1 release)** and
> **PRD v15 (UI polish)**. Supersedes nothing in CONTEXT.md's glossary; it scopes which
> of that language ships in R1.

## Why this exists (the ground-truth reframe)

The product is **built**, not absent. The audit confirmed real Claude text generation,
real DB, real server-side entitlements/caps/credits, real auth, real voice & moments.
The app *looks* empty for exactly two fixable reasons:

1. **Illustration pipeline is failing in this environment** — 48/48 fal.ai image calls
   returned `failed`; zero images on disk. Books silently degrade to text-only `draft`.
   This is what reads as "no stories."
2. **No honest seed** — the demo seed is gated off by an unset `DEV_DEMO_SEED` flag, and
   even when enabled it writes empty, page-less books.

Plus: **Persona LoRA training is faked in local dev** (`FakeWorkflow.waitForEvent`
synthesizes `ready`), so "ready" personas carry non-functional LoRA keys.

**R1's #1 job is therefore to make the existing loop visibly produce one real
illustrated story** — not to build new features.

## Locked decisions

| Decision | Choice | Consequence |
|----------|--------|-------------|
| Platform | **iOS-only** (Expo app in `mobile/`) | Web stays backend only for R1 |
| Payment | **Apple IAP via RevenueCat** | 30%/15% rev-share; entitlement server-side |
| Consent | **Email-Plus VPC** (ADR-0018) | IAP can't prove payer ID → card ≠ consent; consent is a separate emailed, notice-versioned, revocable confirmation that gates Baby Persona creation |
| R1 centerpiece | **Fix illustration pipeline + honest seed** | Real illustrated book must appear; add `DEV_FAL_FALLBACK` placeholder + `DEV_DEMO_SEED` real seed |
| Market | **Asia + US** (per ADR-0015) | ⚠️ Long pole: multi-jurisdiction engine ships **real**, not stubbed; per-market legal review gates launch. Sequencing risk flagged. |
| Plans | **One plan only** for R1 | Entry plan (illustrated stories, solo parent) + 7-day trial; premium tier hidden until its features (voice/video/invited members) exist |
| Cast | **One Baby Persona, solo Guardian** | No invited members/family logins (defers ADR-0024); single-persona Scenes only |
| Story type | **Bedtime only** | Learning deferred |
| Keepsake | **PDF Export, no Share links** | Likeness never leaves device except user-initiated local export (trims ADR-0013) |
| Re-rolls | **Free budget, no credit metering** | No credit ledger / Story-cap enforcement surfaced in R1 |
| Aha | **Baby-free pre-baked Demo Story** before any sign-up/paywall | |
| UI | **Native-polish track** (separate PRD) | Craft, not restyle; keep Maya's World warmth + emoji |

### Deferred to R2+
Voice clips / messages / lullaby weave · Video pages · Invited Members & family logins ·
Two-plan pricing + Member-login cap + Create-rights + Credits + Story cap · Adult/multi
persona · Custom art style (Style LoRA) · Personalized Classics · Journal/Moments/Daily
nudge/Firsts/Birthday/photo-to-story/Story Context Engine · Roster avatars · Share links ·
Multi-baby Households · Learning story type · Web surface.

## R1 "aha" path
1. Open → pre-baked **baby-free Demo Story** (illustrated, swipeable) — quality before any ask.
2. "Make one starring my baby" → **sign up**.
3. **Start 7-day trial** (RevenueCat IAP).
4. **Email-Plus consent**: attest guardianship → emailed notice-versioned link → confirm →
   `consent_verified` + receipt (revoke link sent after).
5. **Upload 10–15 baby photos** → LoRA training starts (background).
6. Fill the **Brief** (Bedtime + theme + optional note) while training runs.
7. Persona `ready` → **likeness confirmation** (accept samples).
8. **Generate** → pages fill → land on a finished **draft** (terminal state guaranteed).
9. Read; free re-roll a weak page; **finalize**.
10. **Export PDF** keepsake. *Aha delivered.*

---

## Invariants (testable; PRD + issues must restate the relevant ones)

### Latency / performance budgets
- **Demo Story** loads < **1s** (pre-baked, no generation).
- **Story text** for a full book: p95 < **30s**; show progress, never a blank wait.
- **Per-page illustration**: p95 < **60s/page**; whole book (≤8 pages) reaches a terminal
  state within the **5-min watchdog budget** (`POLL_BUDGET_MS`) or surfaces a timeout —
  **never** an infinite "Illustrating".
- **LoRA training**: async, bounded SLA < **15 min** to `ready`/`failed`; likeness
  confirmation gate **before** any book-generation spend.
- **App cold start** to interactive: < **3s**.
- **Reader page turn**: < **100ms** even with animation.
- **Storybook detail payload**: < **500KB** (images via signed URLs, never inline base64).

### Failure modes (per external dependency)
- **Claude (text)**: error/timeout → retry once → else book `failed` with re-roll
  affordance. Refusal/empty → `failed`, never a blank book.
- **fal.ai (illustration + LoRA)** — *the current blocker*: image failure → page marked
  `failed` (re-rollable hole) + book degrades to **text-viewable draft**; LoRA failure →
  persona `failed`, surfaced, **no charge** for the book. Bounded watchdog reaper forces a
  terminal state. R1 must **actually fix** the 100% image-failure (diagnose key/endpoint/
  quota/model) **and** ship `DEV_FAL_FALLBACK` placeholder for local-dev/demo.
- **Supabase (DB/auth)**: outage → auth **fails closed**; reads surface error + retry; no
  partial writes (persona + consent receipt written transactionally).
- **RevenueCat / Apple IAP**: purchase failure → entitlement does **not** flip; clear
  error; server-side entitlement is source of truth; restore-purchases path exists; trial
  start requires a successful IAP.
- **Email-Plus VPC email**: send failure → consent **not** granted, Baby Persona creation
  **blocked**, retryable; consent link is notice-versioned + single-use; revoke link
  always available; revoke → clears `consent_verified` → routes child data to purge.
- **Moderation (CSAM hash / safety classifier / image moderation)**: **fails CLOSED** — if
  unavailable, block the upload/generation rather than allow.

### Security / consent boundaries
- **Baby Persona creation** gated by server-verified `consent_verified` (Email-Plus VPC) —
  never client-trusted.
- **Household data isolation** (RLS): a Member sees only their Household; child photos/LoRA
  never cross Households.
- **Raw child photos**: write-only, never rendered on any surface (ADR-0020/0021); roster
  avatar is generated, never the raw selfie.
- **Likeness egress**: R1 has **no Share links** → a child's likeness leaves the device
  only via user-initiated **PDF Export** (local).
- **Hard-delete**: always available; erases all child data across every store (ADR-0007).
- **Secrets**: `ANTHROPIC_API_KEY`, `FAL_API_KEY`, Supabase service keys are **server-side
  only** — never in the Expo bundle. `EXPO_PUBLIC_*` is public by definition; audit that no
  secret rides one. (Current `EXPO_PUBLIC_DEV_PASSWORD` is a dev-only sim cred — must not
  ship in a release build.)
- **Apple App Review (Guideline 4.2 / kids & biometric data)**: the consent flow + privacy
  disclosures must pass review; this is a launch gate, not a nicety.

### Proposed ADR amendments (R1 records these)
- **ADR-0025** (two-plan): R1 ships **one plan**; two-plan model returns in R2 when its
  features exist. (Amendment, not reversal.)
- **ADR-0003** (web-first): R1 is **iOS-first**; ADR-0018 already accepts the iOS rail.
- Consider a light **ADR-0026 "R1 release scope & sequencing"** to record the cut + the
  Asia+US sequencing risk.
