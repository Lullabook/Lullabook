# 174 — First-open Demo Story + 5-step entry flow

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar C — composes payment (A) and
consent (B) into the entry funnel. Carries **D6**, **FAIL-5**, **PERF-4**.

## What to build
1. **Demo (D6, PERF-4).** Render the pre-baked baby-free `DemoStoryService` Story ("Maya and
   the Moon") on first open as the free aha — **static content, bundled illustrations /
   placeholder art, no generation spend, no network** (render < 1s). No signup, no card.
2. **Flow (FirstOpenService).** Wire the canonical order **demo → signup → trial → consent →
   photos** (`FirstOpenService.getFlow`): the demo leads to signup, then the paywall/trial
   (Pillar A, issues 170–171), then the Email-Plus consent flow (Pillar B, issue 173), then
   the baby-photo upload — which is gated on **both** entitlement and `consent_verified`
   server-side (never trusting client order).
3. **Failure (FAIL-5).** If the demo asset fails to load, degrade to **skip-to-paywall**
   (`FirstOpenService.onDemoFailed`) — a usable state, never a white screen.
4. **Idempotent re-entry.** A returning Household that already cleared some steps resumes at
   the first unmet gate (already-trialing → skip trial; already-consented → skip consent),
   resolved from server state, not a client flag.

## Acceptance criteria
- [ ] D6 / PERF-4: first open shows the static Demo Story (< 1s, no network/gen), baby-free.
- [ ] The 5-step flow advances demo → signup → trial → consent → photos; baby upload is
      reachable only after **both** the trial (entitlement) and consent gates are cleared
      server-side.
- [ ] FAIL-5: demo asset failure → skip-to-paywall, no white screen.
- [ ] Re-entry resumes at the first unmet gate (server-resolved), not a dead end or a repeat.
- [ ] Mobile typecheck clean; `npx eslint mobile` clean; existing suite green.

## Verification-command
```bash
npx vitest run tests/174-first-open-entry-flow.test.ts && npm run verify
```

## Blocked by
171, 173
