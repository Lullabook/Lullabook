# Demo Evidence Report — Issue 223 (PRD v23 full-likeness demo)

- Generated: 2026-08-08T08:40:32.255Z
- Verdict: **BLOCKED**

> BLOCKED: This report is BLOCKED: no live Simulator session has produced the complete evidence — or a required item is invalid, an invariant is violated, or an invariant verdict is left unproven. A deterministic pass alone never counts as the demo.

## Required live evidence

| Item | File | Status | Requirement |
|---|---|---|---|
| session-recording | `session.json` | missing ✗ | a recorded Simulator session spanning sign-in to a finished 12-Page Storybook, proving the 5-Persona Family journey facts |
| fal-request-ids | `fal-requests.json` | missing ✗ | five fal.ai training request ids |
| spend-ledger-under-cap | `spend-ledger.json` | missing ✗ | reconciled total live fal spend recorded and under the $20 cap (COST-1) |
| native-latency | `latency.json` | missing ✗ | native cold start p95 < 3s and Page turn p95 < 100ms (LAT-4) |
| pro-grant-server-authoritative | `pro-grant.json` | missing ✗ | demo Pro obtained via the server-authoritative grant route, not a client flag (ENT-1) |

## PRD v23 invariant verdicts (all 29, none skipped)

| Invariant | Verdict | Description | Note |
|---|---|---|---|
| LAT-1 | unproven | POST /api/storybooks returns a persisted job, p95 < 2s, no provider work inline |  |
| LAT-2 | unproven | Story text generation p95 < 25s |  |
| LAT-3 | unproven | Full twelve-Page production-like generation p95 < 90s, after Personas are ready |  |
| LAT-4 | unproven | Native cold start p95 < 3s; Page turn p95 < 100ms |  |
| LAT-5 | unproven | One Persona LoRA training completes or fails terminally within 25 min wall clock, with a visible progress state |  |
| LAT-6 | unproven | A verified training callback is processed and Persona state advanced within 30s of receipt |  |
| LAT-7 | unproven | Roster read for a 5-Persona Family p95 < 500ms, payload < 500KB |  |
| FAIL-1 | unproven | Every Story reaches draft or failed; no Story stays generating past the watchdog |  |
| FAIL-2 | unproven | Invalid or contract-violating Story text fails before any image spend |  |
| FAIL-3 | unproven | fal training 4xx/5xx/timeout/malformed artifact → durable failed state + Retry; no partial Persona, orphaned blob, or double spend |  |
| FAIL-4 | unproven | Callback never arrives → a watchdog polls fal.ai for terminal status within LAT-5 |  |
| FAIL-5 | unproven | Duplicate, stale, out-of-order, or unsigned callbacks rejected; never advance state or spend twice |  |
| FAIL-6 | unproven | Vercel/public callback URL unreachable → training submission fails closed before money is spent |  |
| FAIL-7 | unproven | Anthropic 5xx/rate-limit → retry twice with backoff, then mark Brief failed with provider_unavailable; no image spend after a failed text step |  |
| FAIL-8 | unproven | A Brief saved while Personas train resumes exactly once after every selected Persona is confirmed, surviving a restart |  |
| FAIL-9 | unproven | Moderation rejects a source photo → no owned blob persists, no provider call, Guardian sees the rejected photo |  |
| SEC-1 | unproven | Provider credentials server-side only; never in the Expo bundle or a client response |  |
| SEC-2 | unproven | No minor's photo reaches storage or a provider before that minor's own verified parental consent receipt and moderation |  |
| SEC-3 | unproven | An Adult Persona requires the subject's own self-consent; a Guardian attestation never stands in |  |
| SEC-4 | unproven | Training callbacks authenticated by timestamp, body hash, and signature before any business data is parsed |  |
| SEC-5 | unproven | Per-Family isolation enforced by row-level security, not only application checks |  |
| SEC-6 | unproven | Hard-delete propagates across database, owned blobs, and provider-held artifacts |  |
| SEC-7 | unproven | Roster and reader responses return generated avatars/Page art, never a raw uploaded source photo |  |
| SEC-8 | unproven | Minor status decided by the configured child-age threshold for the Family's jurisdiction; nothing hardcoded |  |
| SEC-9 | unproven | Consent receipt for a minor records the consenting adult's identity, and that adult is the account-holding parent |  |
| ENT-1 | unproven | Demo Pro is a server-authoritative grant; the entitlement gate is exercised, never bypassed by a client flag or build-time bypass | no pro-grant provenance recorded |
| COST-1 | unproven | Cumulative live fal.ai spend hard-capped at $20, enforced by a pre-attempt fail-closed reservation | no spend ledger |
| COST-2 | unproven | No live provider call runs without LIVE_PROVIDER_RUN_APPROVED set for that run | no live run recorded |
| COST-3 | unproven | A second full five-Persona retrain (~$6) must stop and ask the Guardian before it runs |  |

## Independent verification

- **COST-1** ($20 cap from the ledger): unproven — no spend ledger
- **ENT-1** (server-authoritative grant, code-path checked): unproven — no pro-grant provenance recorded

## Blocked on — missing / invalid evidence

- missing:session-recording
- missing:fal-request-ids
- missing:spend-ledger-under-cap
- missing:native-latency
- missing:pro-grant-server-authoritative

Unproven invariant(s) — evidence still missing; never a PASS:
- **LAT-1** — POST /api/storybooks returns a persisted job, p95 < 2s, no provider work inline
- **LAT-2** — Story text generation p95 < 25s
- **LAT-3** — Full twelve-Page production-like generation p95 < 90s, after Personas are ready
- **LAT-4** — Native cold start p95 < 3s; Page turn p95 < 100ms
- **LAT-5** — One Persona LoRA training completes or fails terminally within 25 min wall clock, with a visible progress state
- **LAT-6** — A verified training callback is processed and Persona state advanced within 30s of receipt
- **LAT-7** — Roster read for a 5-Persona Family p95 < 500ms, payload < 500KB
- **FAIL-1** — Every Story reaches draft or failed; no Story stays generating past the watchdog
- **FAIL-2** — Invalid or contract-violating Story text fails before any image spend
- **FAIL-3** — fal training 4xx/5xx/timeout/malformed artifact → durable failed state + Retry; no partial Persona, orphaned blob, or double spend
- **FAIL-4** — Callback never arrives → a watchdog polls fal.ai for terminal status within LAT-5
- **FAIL-5** — Duplicate, stale, out-of-order, or unsigned callbacks rejected; never advance state or spend twice
- **FAIL-6** — Vercel/public callback URL unreachable → training submission fails closed before money is spent
- **FAIL-7** — Anthropic 5xx/rate-limit → retry twice with backoff, then mark Brief failed with provider_unavailable; no image spend after a failed text step
- **FAIL-8** — A Brief saved while Personas train resumes exactly once after every selected Persona is confirmed, surviving a restart
- **FAIL-9** — Moderation rejects a source photo → no owned blob persists, no provider call, Guardian sees the rejected photo
- **SEC-1** — Provider credentials server-side only; never in the Expo bundle or a client response
- **SEC-2** — No minor's photo reaches storage or a provider before that minor's own verified parental consent receipt and moderation
- **SEC-3** — An Adult Persona requires the subject's own self-consent; a Guardian attestation never stands in
- **SEC-4** — Training callbacks authenticated by timestamp, body hash, and signature before any business data is parsed
- **SEC-5** — Per-Family isolation enforced by row-level security, not only application checks
- **SEC-6** — Hard-delete propagates across database, owned blobs, and provider-held artifacts
- **SEC-7** — Roster and reader responses return generated avatars/Page art, never a raw uploaded source photo
- **SEC-8** — Minor status decided by the configured child-age threshold for the Family's jurisdiction; nothing hardcoded
- **SEC-9** — Consent receipt for a minor records the consenting adult's identity, and that adult is the account-holding parent
- **ENT-1** — Demo Pro is a server-authoritative grant; the entitlement gate is exercised, never bypassed by a client flag or build-time bypass
- **COST-1** — Cumulative live fal.ai spend hard-capped at $20, enforced by a pre-attempt fail-closed reservation
- **COST-2** — No live provider call runs without LIVE_PROVIDER_RUN_APPROVED set for that run
- **COST-3** — A second full five-Persona retrain (~$6) must stop and ask the Guardian before it runs

