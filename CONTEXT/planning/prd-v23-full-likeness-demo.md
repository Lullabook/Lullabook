# PRD v23 — Full-likeness family demo (Simulator-first, iPhone destination)

Status: accepted (planner, 2026-08-06)
Parent wayfinder: #136 (real illustration + LoRA pipeline)
Supersedes nothing. Extends PRD v22 (reachable app release readiness) with the
first **live** provider path.

## Why this exists

PRD v22 closed with every implementation ticket `Done` and 1225 deterministic
tests passing, yet the Guardian who owns this product cannot run the app with
Stories and Family members in it. Every live/native evidence item reported
`BLOCKED by design`. The gap is not test coverage. The gap is that **the real
provider path has never run once**: no LoRA has ever been trained on fal.ai,
`LIVE_PROVIDER_RUN_APPROVED` has never been set, and the training callback has
never been received from the public internet.

This PRD makes the real path run, end to end, with the real family.

## Destination

The Guardian opens Lullabook, creates a Family roster of five real people,
passes the consent gate for two minors and self-consent for three adults,
trains a real FLUX LoRA per Persona on fal.ai, confirms each likeness, and
generates a twelve-Page illustrated Bedtime Storybook in which his own family
is recognisable in the art. It works in the iOS Simulator first. The iPhone is
the destination.

## Locked decisions (from the /planner grill, 2026-08-06)

| # | Decision | Value |
|---|---|---|
| D1 | Sizing | No `/wayfinder` pass. A collaborative reproduction ticket replaces it. |
| D2 | Working target | iOS Simulator, built and styled as an iPhone app. |
| D3 | Destination | Real iPhone. Non-negotiable goal, not a fallback rung. |
| D4 | Images | Real FLUX LoRA likeness. Placeholder art is not an acceptable demo. |
| D5 | Family | Full roster, likeness-trained. Not names-only. |
| D6 | Regulation | Consent gate and moderation hold in full on the live path. |
| D7 | Story text model | Sonnet 4.6 stays. No cheap-LLM swap before the demo. |
| D8 | fal.ai budget | **$20 authorized.** Any increase needs a fresh human approval. |
| D9 | Photos | User-owned. Folder `lullabook family testing` + a handover document. |
| D10 | Roster | 5 Personas. 2 minors, 3 adults. See below. |
| D11 | Branding | "Maya's World" was an internal codename. It must not appear as a brand. |
| D12 | Apple / EAS | Purchased on an explicit user signal. Never on a day trigger. |
| D13 | Callbacks | Vercel. A stable public URL, and the demo surface. |
| D14 | Prime Intellect | Off the critical path. User-owned, optional. |
| D15 | Schedule | Two weeks is the ideal, not a per-ticket day plan. Order by dependency. |
| D16 | Consent authority | The account that consents for a minor is held by the **father or the mother**. No delegated-guardian path is built. |
| D17 | Jurisdictions | v1 launch config covers **Australia, Canada, United States, United Kingdom**. India and Singapore come later. |
| D18 | Demo threshold | The demo runs against the **strictest** launch jurisdiction, child age `< 18`, so **both** minors need verified parental consent. See the assumption below. |
| D19 | Demo entitlement | **Full Pro, server-granted.** The real entitlement gate is exercised; no purchase happens in the Simulator. Stripe / web payment is a post-demo release concern. |
| D20 | Backend split | **Vercel** for training and the demo. **Local dev** for UI and polish only. |

### Stated assumption — the demo family's jurisdiction (D18)

The demo family's country of residence was never put on the record, and the
child-age threshold decides whether the 14-year-old brother is a minor. Rather
than guess, this PRD does two things.

1. **The threshold stays configuration, per ADR-0015.** Ticket 207 implements
   the minor path and the adult self-consent path both driven by the configured
   threshold for the Family's jurisdiction. Neither age nor threshold is
   hardcoded anywhere.
2. **The demo defaults to the strictest launch jurisdiction**, child age
   `< 18`. Under that value the 3-year-old daughter **and** the 14-year-old
   brother both require verified parental consent, giving two minor flows and
   three adult self-consent flows.

Building for the strictest threshold is fail-safe: a jurisdiction with a lower
threshold (United States or United Kingdom at 13) is automatically satisfied,
because the 14-year-old simply routes to self-consent through the same
configured code path. If the Guardian later states a different country, only the
configuration value changes, not the implementation.

### Why Vercel for training and local dev for polish (D20)

fal.ai must reach a public URL to deliver a training callback, and it cannot
reach a local dev server. So every ticket that touches training, callbacks, or
the demo run targets the deployed Vercel environment. Design and polish work
touches no callback, so it runs on local dev for a fast iteration loop. Each
ticket below names its target backend.

### The roster (D10)

| Person | Age | Consent flow at the demo threshold (`< 18`) |
|---|---|---|
| Daughter | 3 | **Verified parental consent** (minor in every launch jurisdiction) |
| Brother | 14 | **Verified parental consent** (minor at `< 18`; self-consents at `< 13`) |
| Father | 43 | Adult self-consent — **also the consenting parent** |
| Mother | 38 | Adult self-consent — **also the consenting parent** |
| Brother | 27 | Adult self-consent |

The consenting account belongs to the father or the mother (D16), so one account
holder lawfully consents for both minors.

Two independent minor consent flows. Neither minor's photo may reach durable
storage or a provider before **that minor's own** consent receipt exists.

### Why Prime Intellect is not on the critical path (D14)

`prime train --help` (v0.6.21) runs the **`prime-rl`** container over
**verifiers** environments: reinforcement learning for language models.
`prime env`, `prime eval`, and `prime gepa` are LLM-side tools. Nothing in the
CLI trains a FLUX diffusion LoRA. Prime therefore cannot replace fal.ai for
likeness, and cannot de-risk it. Its genuine fit is `prime gepa` on the
Story-text prompt, which is filed as an optional user-owned ticket.

---

## Named invariants

These are the falsifiable constraints. `/debugger` attacks them, `/reviewer`
reviews against them, and every ticket that touches one restates it.

### Latency and performance budgets

| Name | Budget |
|---|---|
| `LAT-1` | `POST /api/storybooks` returns a persisted job, p95 `< 2s`, no provider work inline. |
| `LAT-2` | Story text generation p95 `< 25s`. |
| `LAT-3` | Full twelve-Page production-like generation p95 `< 90s`, after Personas are ready. |
| `LAT-4` | Native cold start p95 `< 3s`; Page turn p95 `< 100ms`. |
| `LAT-5` | **New.** One Persona LoRA training completes or fails terminally within `25 min` wall clock. The Guardian sees a progress state the whole time; no screen shows an unbounded spinner. |
| `LAT-6` | **New.** A verified training callback is processed and the Persona state advanced within `30s` of receipt. |
| `LAT-7` | Roster read for a 5-Persona Family p95 `< 500ms`, payload `< 500KB`. |

### Failure modes

| Name | Rule |
|---|---|
| `FAIL-1` | Every Story reaches `draft` or `failed`. No Story stays `generating` past the watchdog. |
| `FAIL-2` | Invalid or contract-violating Story text fails **before** any image spend. |
| `FAIL-3` | fal.ai training returns 4xx/5xx, times out, or returns a malformed artifact → the Persona reaches a durable `failed` state with a redacted, observable reason, and a **Retry** control. No partial Persona, no orphaned blob, no double spend. |
| `FAIL-4` | **The callback never arrives.** A training submitted with no callback inside `LAT-5` is reconciled by a watchdog that polls fal.ai for terminal status. Training must not depend on the callback alone. |
| `FAIL-5` | Duplicate, stale, out-of-order, or unsigned callbacks are rejected and never advance state or spend twice. |
| `FAIL-6` | Vercel or the public callback URL is unreachable → training submission fails closed **before** money is spent, with a message naming the unreachable callback. |
| `FAIL-7` | Anthropic 5xx or rate-limit → retry twice with backoff, then mark the Brief `failed` with reason `provider_unavailable`. No image spend follows a failed text step. |
| `FAIL-8` | A Brief saved while Personas train resumes **exactly once** after every selected Persona is confirmed, and survives a process restart. |
| `FAIL-9` | Moderation rejects a source photo → no owned blob persists, no provider call is made, and the Guardian sees which photo was rejected. |

### Security and permission boundaries

| Name | Rule |
|---|---|
| `SEC-1` | Provider credentials (`FAL_API_KEY`, `ANTHROPIC_API_KEY`) are server-side only. They never enter the Expo bundle or any client response. |
| `SEC-2` | **No minor's photo reaches storage or a provider before that minor's own verified parental consent receipt exists and moderation has passed.** Per minor, never per Family. |
| `SEC-8` | Whether a person is a minor is decided by the **configured child-age threshold for that Family's jurisdiction** (ADR-0015). No age and no threshold is hardcoded. Changing the configured country changes the routing with no code change. |
| `SEC-9` | The consent receipt for a minor records the consenting adult's identity, and that adult is the account-holding parent (D16). |
| `ENT-1` | The demo's Pro access is a **server-authoritative grant**. The entitlement gate is exercised, not bypassed. A client-side flag or a build-time bypass never satisfies it. |
| `SEC-3` | An Adult Persona requires the subject's own self-consent. A Guardian attestation can never stand in for it. |
| `SEC-4` | Training callbacks are authenticated by timestamp, body hash, and signature against fal.ai's public keys **before** any business data is parsed. |
| `SEC-5` | Per-Family isolation is enforced by row-level security in the database, not only by application checks. |
| `SEC-6` | Hard-delete propagates across the database, owned blobs, and provider-held artifacts (LoRA weights, training ZIPs). |
| `SEC-7` | Roster and reader responses return generated avatars and Page art, never a raw uploaded source photo. |
| `COST-1` | **Cumulative live fal.ai spend is hard-capped at `$20`.** The cap is enforced by a pre-attempt reservation that fails closed, not by a dashboard. An unpriced route is never treated as free. Agents may spend freely **within** the cap. |
| `COST-3` | A second full five-Persona retrain round costs about `$6` and must **stop and ask the Guardian** before it runs, because it consumes most of the remaining budget. The Guardian raises the cap; an agent never raises it. |
| `COST-2` | No live provider call runs without `LIVE_PROVIDER_RUN_APPROVED` set for that run. |

---

## Scope

**In:** reproduction of the current failures, Vercel deploy and public callback
URL, live fal.ai training auth and signed-callback wiring, the `$20` spend cap,
photo intake from the user-owned folder, five-Persona consent-gated creation,
real LoRA training for five Personas, likeness confirmation and crash-safe Brief
resume, the twelve-Page Sonnet contract with five-Persona Story context,
multi-Persona likeness illustration, the end-to-end Simulator demo, visible
design polish, the branding audit, and the iPhone device build behind a user
purchase signal.

**Out:** audio, video Pages, invited Family members, Android, Personalized
Classics, custom Style LoRAs, Share links, new web creation surfaces, the
cheap-LLM story-model swap, and anything on Prime Intellect.

## Acceptance constraints

The PRD is satisfied when a single Simulator session, recorded, shows: five
Personas created behind two minor consent flows and three adult self-consent
flows; five real fal.ai LoRA trainings completed; five likenesses confirmed; one
twelve-Page Storybook generated in which at least two family members are
recognisable in the same Page; every invariant above holding; and total live fal
spend reported under `$20`. The iPhone build repeats that session on device once
the Guardian signals the Apple purchase.
