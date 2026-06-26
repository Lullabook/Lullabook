# PRD v17 — Test framework the agent can run, honest seed, and automatic error capture

> Status: ready for agent. Planning artifact from `/part1` (2026-06-23). Paired with
> [PRD v16](prd-v16-r1-ruthless-cut.md) (the cut). Decisions & invariants locked in
> [`r1-simplify-test-logging-invariants.md`](r1-simplify-test-logging-invariants.md). Logging
> vendor chosen via a research fan-out: **Sentry** (rationale below).

## Why this wave

The founder's recurring experience: *"I test the app, it doesn't work; I ask Claude to check,
it still doesn't work — because the bug never gets captured anywhere."* That is a **feedback-loop
failure**, and it has three compounding causes, all rated equally painful:

1. **Silent failures** — already partly addressed by R1 issues 122–123 (fix fal.ai +
   `DEV_FAL_FALLBACK`).
2. **No way to see it working** — there is no honest, repeatable seed and no agent-runnable
   harness, so every test starts from nothing and dies somewhere new.
3. **Bugs vanish** — there is **zero logging/telemetry** in the codebase, so each debugging
   round re-derives the failure from scratch.

This wave fixes (2) and (3): give the agent **one command to verify the app**, **a deterministic
seed so testing never starts from zero**, and **a place where every runtime error is captured the
moment it happens** — including a path from a captured error to a tracked issue. That is the
modern version of the "HockeyApp" crash→ticket loop the founder asked for.

## Logging vendor decision — Sentry (free Developer plan, EU region)

A research fan-out compared Sentry, Bugsnag, GlitchTip (self-host), a Supabase-native build,
Rollbar, LogRocket, Highlight.io, and Microsoft App Center. **Sentry wins for this exact stack:**

- **Only mature tool with first-class SDKs for *both* surfaces we ship** — official
  `@sentry/react-native` Expo config plugin (blessed in Expo's own docs) **and** `@sentry/nextjs`
  with a wizard that wires client/server/edge + source maps in one command.
- **Free Developer plan** (5,000 errors/mo, 30-day retention) — $0 at pre-launch volume.
- **Native error→issue automation** — an Issue Alert rule auto-creates a GitHub/Linear ticket
  with two-way status sync. Exactly the HockeyApp loop, modernized.
- **EU data residency (Frankfurt) + mandatory PII scrubbing on the free tier** — load-bearing
  because we handle children's photos + biometric LoRA data.
- **No lock-in** — the SDK protocol is also spoken by self-hosted GlitchTip if we ever want zero
  third-party exposure.

**HockeyApp reality check (the founder's reference):** HockeyApp → Visual Studio App Center →
**retired March 31 2025** (crash analytics extended only to ~March 2027). Microsoft's heir is
Azure Monitor mobile — enterprise-Azure-shaped overkill for a solo Expo dev. Sentry is the
indie-friendly successor. Full comparison table + sources in the research notes carried into the
handoff.

## Scope → tracks

| Track | Theme | Issues |
|-------|-------|--------|
| **T1 — Capture (Next.js API)** | Sentry on the server: error capture, **PII/child-data scrubbing**, **fail-open** | 150 |
| **T2 — Capture (Expo app)** | Sentry on iOS: crash capture, source maps, **no replay/screenshots on photo screens** | 151 |
| **T3 — Error → issue** | Auto-create a GitHub issue from a new production error, deduped | 152 |
| **T4 — Honest seed harness** | Deterministic fixture: one command → known-good Household + baby + family + real illustrated book | 153 |
| **T5 — Agent `verify` gate** | One command runs the whole suite, < 5 min, exits non-zero on any real failure | 154 |
| **T6 — Mobile/Expo e2e** | Headless iOS flow for the core loop (the shipping surface has none today) | 155 |

Build order **T1 → T2 → T3** (capture before automation), then **T4 → T5 → T6** (seed before the
gate that uses it; mobile e2e last as the biggest new piece). T1/T4/T5 are independent of T6 and
deliver value immediately.

## Invariants (acceptance constraints — restated from the decisions doc)

### Latency / performance
- The `verify` suite (unit + integration + web e2e + smoke) runs in **< 5 min** locally and is
  deterministic (uses `DEV_FAL_FALLBACK`, no live keys).
- Logging adds **< 10ms** on the API happy path and is **fire-and-forget** — capture is async,
  never blocks a response or a render.
- The deterministic seed produces identical data for the same seed input.

### Failure modes
- **Logging fails OPEN** — the deliberate opposite of moderation. If Sentry/the SDK is
  unreachable, errors are dropped/buffered silently and **the app keeps working**. A logging
  outage must never take down a request, a render, or a generation.
- Seed/test-bypass flags are **double-gated and inert in production**; a failed seed leaves no
  partial Household.
- `verify` exits **non-zero on any real failure** and prints a readable summary — no swallowed
  failures, no skipped-as-passed green-washing.

### Security / permission boundaries (the COPPA/GDPR line — load-bearing)
- The logger **never captures child photos, biometric/LoRA data, PII, consent tokens, auth
  tokens, or secrets.** `beforeSend` scrubbing (client-side, before data leaves the device) +
  server-side scrubbing rules are **mandatory and tested**. Session Replay and crash screenshots
  are **off** on any screen showing a photo or a child's name. EU region selected at org
  creation. `sendDefaultPii: false`.
- Source maps / `SENTRY_AUTH_TOKEN` are **build-time / EAS-secret only** — never in the Expo
  bundle, never expose a secret. Sentry is disabled (or DSN-less) under Vitest/Playwright so test
  noise never hits the quota.

## Notes / risks
- **Sentry account setup is a one-time human step** (create org in EU region, get DSN, configure
  the GitHub integration's Issue Link settings — a known gotcha or alert-creation silently
  no-ops). Issues flag where that's a prerequisite.
- **Mobile e2e (155)** is the biggest unknown — Expo/RN e2e (Maestro is the leading
  agent-friendly, YAML-flow, headless option) is new to this repo. Treated as the last slice so
  the rest of the wave ships regardless.
- **No interference with R1 Track A** — these are additive (observability + harness); they don't
  modify the generation pipeline, only observe and exercise it.
