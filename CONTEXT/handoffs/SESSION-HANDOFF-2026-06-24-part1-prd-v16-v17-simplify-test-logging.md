# Session Handoff — /part1: PRD v16 (ruthless cut) + PRD v17 (test framework + logging)

> Date: 2026-06-24. Type: `/part1` planning chain (planning artifacts only — **no app code
> written**). Branch: `feat/r1-track-a-122-126` (GLM 5.2 is concurrently implementing R1
> Track A 122–126 on this branch; this session touched **only `CONTEXT/` docs**, never code).

## What this session produced

Two PRDs that sit **on top of** the R1 release (PRD v14), answering the founder's ask:
*simplify R1 so it's finishable*, and *make the app something the agent can verify itself with
bugs auto-captured* (the "it never works when I test it" loop).

- **PRD v16 — Ruthless R1 cut** → `planning/prd-v16-r1-ruthless-cut.md` → **issues 145–149**.
- **PRD v17 — Test framework + honest seed + automatic error capture** →
  `planning/prd-v17-test-framework-and-logging.md` → **issues 150–155**.
- **Decisions + invariants gate** (feeds both) →
  `planning/r1-simplify-test-logging-invariants.md`.
- **Glossary** updated → `CONTEXT.md` (new section: Ruthless cut, Inert-not-broken, Daily Notes,
  Verify gate, Honest seed harness, Error capture).

## Locked decisions (the founder's call)

**v16 — what R1 cuts (each cut enforced as a server-side gate, no dead UI):**
- **Audio** — voice clips/messages, lullaby weave, narration → cut.
- **Multi-family** — invited members, family logins, collaborative plan, multi-baby → cut. R1 is
  **solo Guardian, one baby**. Amends ADR-0024.
- **Subscription** — **solo plan(s) only**; collaborative plan cut. Finalizes issue 129. Amends
  ADR-0025.
- **Asia** — **US-only R1.0**; Asia is a config-flagged R1.1 fast-follow. Sequences ADR-0015.
- **Kept:** story creation (the centerpiece) + **Daily Notes** (un-defers v14's cut, minimal
  capture only; the Story Context Engine / Firsts / Birthday / weekly-suggestion machinery stays
  deferred).

**v17 — verify + capture:**
- **Logging vendor = Sentry** (free Developer plan, **EU/Frankfurt** region for GDPR). Chosen
  via a research fan-out over Sentry / Bugsnag / GlitchTip / Supabase-native / Rollbar /
  LogRocket / Highlight.io / App Center. Sentry is the only mature tool with first-class **both**
  Expo **and** Next.js SDKs, has native **error→GitHub/Linear issue** automation, and PII
  scrubbing + EU residency on the free tier. **HockeyApp→App Center is retired (Mar 2025; crash
  analytics only to ~Mar 2027); heir Azure Monitor mobile is enterprise overkill.**
- **Test framework** = extend Vitest + Playwright with a deterministic seed fixture, a single
  agent-runnable `npm run verify` gate, and the first **mobile/Expo e2e** (Maestro) for the
  shipping surface.

## Invariants carried into the issues (the PASS/FAIL contract)

- **v16:** deferred = **inert, not broken** (server gate + no reachable UI; disabled endpoints
  return clean `404`/`403`, never 500). Cutting multi-family **closes** authz (solo-Guardian
  create-rights, one-baby-per-Household server-side). Cut must not regress R1 budgets; cold start
  should shrink.
- **v17:** logging **fails OPEN** (outage never breaks the app — opposite of moderation). The
  logger **never** captures child photos / biometric-LoRA / PII / consent or auth tokens /
  secrets (scrubbing mandatory + tested; replay+screenshots off on photo screens; EU region;
  `sendDefaultPii:false`). `verify` exits non-zero on any real failure (no green-washing); seed
  deterministic + double-gated + inert in prod.

## Slice order (dependency-ordered; each ships a runnable Verification-command)

**v16:** 145 (cut audio) → 146 (cut multi-family / solo plan) → 147 (US-only jurisdiction) →
148 (keep Daily Notes, defer rest) → **149 (dead-UI/endpoint sweep = the wave's acceptance
gate; blocked by 145–148)**.

**v17:** 150 (Sentry on Next.js: capture+scrub+fail-open) → 151 (Sentry on Expo: no photo-screen
replay; blocked by 150) → 152 (error→GitHub issue; blocked by 150) → 153 (deterministic seed;
builds on R1 issue 124) → 154 (agent `verify` gate; blocked by 153) → 155 (mobile/Expo e2e
Maestro; blocked by 153,154).

145, 146, 147, 148, 150, 153 are independently grabbable (no blockers among this wave).

## Next agent starts at: **issue 145** (or 150 if doing the test/logging track first).

## Open prerequisites / risks
- **Sentry account is a one-time human step**: create the org in the **EU region** (can't move
  later), grab the DSN, and configure the **GitHub integration's Issue Link settings** or
  alert-triggered issue creation silently no-ops (issue 152 flags this).
- **Mobile e2e (155)** is the biggest unknown — Maestro is new to this repo; sequenced last so
  the rest ships regardless.
- **ADR-0026 "R1 simplification scope + observability spine"** is worth recording (flagged, not
  written) to capture the cut + the Sentry decision formally.
- **No collision with GLM's R1 Track A (122–126):** v16/v17 touch different surfaces (audio,
  family, jurisdiction, journal, paywall, observability, harness) and only observe/exercise the
  generation pipeline — they don't modify it.
