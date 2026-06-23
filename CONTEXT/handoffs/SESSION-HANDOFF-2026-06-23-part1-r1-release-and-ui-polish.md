# Session Handoff — 2026-06-23: /part1 → R1 release (PRD v14) + UI native polish (PRD v15)

> Planning-only session (`/part1`). No app code written (one exception: a pre-existing
> red-screen crash fix — see Gotchas). Produced the R1 decisions+invariants doc, PRD v14
> (R1 release), PRD v15 (UI polish), issues **122–144**, and a living UI-snapshot folder.
> **Next agent (GLM 5.2) runs `/part2` starting at issue 122 (R1) / 136 (UI).** Two PRs.

## How this started
User: "research what to include in V1 — there's too much; none of the planned features
actually work (no stories generate, no test family, UI isn't Apple-grade); make 2 PRs —
one for R1 scope, one for UI." Ran the paid build live on the iOS Simulator
(`npm run dev:paid` :3001 + `npx expo start --ios --clear` on the **default host** — see
Gotchas), captured every screen, and fanned out 3 research agents.

## The ground-truth reframe (audit agent — the most important finding)
**"Nothing works" is real on screen but the diagnosis was wrong: the features ARE built.**
- ✅ Real Claude `sonnet-4-6` text gen, real DB, real server-side entitlements/caps/credits,
  real auth, real voice + moments, real Characters (Minjee/Finn show in Create).
- ❌ **Illustrations fail 100%** — 48/48 fal.ai calls `failed`, zero images on disk; books
  silently degrade to text-only. *This* is what reads as "no stories."
- ❌ **Demo seed is dead** — gated off by an unset `DEV_DEMO_SEED`, and even when on it
  writes empty page-less books.
- ⚠️ **Persona LoRA training is faked in dev** (`FakeWorkflow.waitForEvent` synthesizes
  `ready` → non-functional LoRA keys).
→ R1's #1 job is to make the existing loop **visibly produce one real illustrated story**,
not to build features.

## What was decided (the grill)
Platform **iOS-only** · payment **RevenueCat IAP** · consent **Email-Plus VPC** (IAP can't
prove payer ID → card ≠ consent) · market **Asia + US** (jurisdiction engine real — ⚠️ the
long pole, in tension with "lean"; sequence US-first if it bites) · **one plan** + 7-day
trial · **one Baby Persona / solo Guardian** · **Bedtime** only · **PDF Export, no Share
links** · **free re-rolls, no credits** · **baby-free Demo Story** aha. Output = **two
planning PRs** (R1 + UI); code lands later via `/part2`. Full table + defer list in the
decisions doc.

## Locked invariants (the PASS/FAIL contract — for /part2's red-team)
- **Latency:** Demo < 1s · text p95 < 30s · per-page img < 60s · book terminal within the
  5-min watchdog (never infinite "Illustrating") · LoRA < 15min · cold start < 3s · page
  turn < 100ms · detail payload < 500KB (signed URLs).
- **Failure modes:** Claude retry→fail; **fal must actually be fixed** + `DEV_FAL_FALLBACK`;
  Supabase fails closed; IAP fail → no entitlement flip; VPC email fail → persona blocked;
  **moderation fails CLOSED**.
- **Security:** Baby Persona gated by server `consent_verified`; dev overrides inert in prod;
  Household RLS; raw photos write-only; **likeness egress only via user PDF export**;
  hard-delete always available; secrets server-side only; **Apple Review (4.2) is a launch gate**.

Full text: `CONTEXT/planning/r1-release-scope-and-invariants.md`.

## Artifacts
- Decisions + invariants: `CONTEXT/planning/r1-release-scope-and-invariants.md`
- PRD v14 (R1): `CONTEXT/planning/prd-v14-r1-release.md`
- PRD v15 (UI): `CONTEXT/planning/prd-v15-ui-native-polish.md`
- Issues: `CONTEXT/issues/122…144` (each has a runnable `Verification-command`)
- UI snapshots (living): `CONTEXT/ui-snapshots/` — `NAVIGATION.md` (button→destination map,
  the file to hand GLM 5.2), `screens/*.png` (16 routes), `refresh.sh` (re-capture after UI
  changes), `README.md`.
- Proposed: light **ADR-0026 "R1 scope & sequencing"** (records the cut + Asia+US risk);
  ADR-0025 amended to one-plan-for-R1; ADR-0003 → iOS-first for R1.

## Build order → 2 PRs
- **PR 1 — R1 release (PRD v14):** issues **122–135**. Tracks A→B→C. **Start at 122**
  (diagnose/fix fal — the riskiest unknown; everything else assumes the loop renders).
  Key chain: 126 (e2e) blocked-by 124,125,132; 130 (jurisdiction) blocked-by 127.
- **PR 2 — UI polish (PRD v15):** issues **136–144**. Tracks UI-A→B→C. **Start at 136**
  (centralize touch feedback+haptics in maya-ui — unblocks 137/143/144). Quick wins first.

## Next agent starts at: issue 122 (R1), 136 (UI)
Run `/part2`: lowest-numbered open issue whose Blocked-by chain is satisfied, build it
test-first, red-team against the invariants above, handoff + push.

## Gotchas (carry forward)
- **Run mobile on the DEFAULT host:** `npx expo start --ios --clear` from `mobile/`. Do NOT
  use `--host localhost` (binds IPv6 `[::1]` only → "could not connect"). The IPv4 proxy is
  NOT required this way. `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001` reaches the paid server
  from the sim.
- **expo-av is gone from Expo Go (SDK 56)** → any top-level `import {Audio} from "expo-av"`
  (even `import type * as`) red-screens the whole app. Fixed this session via
  `mobile/lib/audio.ts` `getAudio()` (lazy guarded require) + inline `import("expo-av")` type
  refs in `stories/[id].tsx` + `family/[id].tsx`. **Voice audio no-ops in Expo Go — needs a
  dev build.** (This is the one code change in this otherwise planning-only session.)
- macOS `* 2.*` duplicate files break expo-router ("Unmatched Route").
- Capture fresh screenshots after any UI change: `CONTEXT/ui-snapshots/refresh.sh`.
