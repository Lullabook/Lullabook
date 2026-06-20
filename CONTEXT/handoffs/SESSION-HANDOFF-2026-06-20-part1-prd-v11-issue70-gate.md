# Session Handoff — 2026-06-20: /part1 PRD v11 (issue-70 upload verification gate)

> Planning-only session. No application code changed. Pointer map — read the
> referenced artifacts, don't re-derive.

## What happened

Ran `/part1` over "what's pending" in `CONTEXT/`. Scope was narrowed by the user:
**iOS app only — drop the web `live-app-audit`/hermes path** (deferred, user-triggered
later). The grill found the pending HITL backlog was already planned in **PRD v10**
(issues 82–87), so v11 is a deliberately **thin addendum**, not a re-plan.

Produced:
- **`CONTEXT/planning/prd-v11-issue70-upload-verification.md`** — addendum to v10.
- **`CONTEXT/issues/88-verify-issue70-photo-upload-gate.md`** — the one new issue.
- Pointer note added to **PRD v10** (`prd-v10-hitl-smoke-verification.md`) flagging
  Gate 0 = issue 88 before 83–87.

## Locked decisions (from the grill)

1. **iOS only.** Web `live-app-audit` (hermes) is out of scope; user triggers it later.
2. **v11 extends v10.** Issues 82–87 and runbook §0–§5 are untouched.
3. **One new issue (88)** = Add-Family photo-upload verification, **Gate 0** (blocks
   83–87, since every downstream slice needs a created persona).
4. **No duplicate issues for owed 75–81 passes** — re-pointed onto v10 runbook sections
   via a mapping table in v11 (§1→83, §2→84, §3→85, §4→86, §5→87). Executing 83–87
   discharges them.
5. **Issue 70 code is already done** (`dc3f836`): `mobile/lib/form-data.ts` +
   `mobile/app/family/new.tsx submit()` wired to `POST /api/personas`. Only the
   recorded HITL pass is owed.
6. **Verification-command is runnable today** without a mobile test harness —
   `form-data.ts` is plain TS over global `FormData`, so its unit test lives in root
   vitest (`tests/mobile-form-data.test.ts`) importing `../mobile/lib/form-data`.

## Invariants (PASS/FAIL contract for issue 88)

Inherits v10's globals; issue-70-specific:
- **Latency:** `submit()` → `POST /api/personas` returns **202 within 10s** (≤6 photos)
  on local `dev:paid`.
- **Failure:** upload 5xx/network → in-screen retryable error, **no crash/unhandled
  rejection**, form stays mounted; camera-deny graceful; selfie optional; 413/415 readable.
- **Security:** photo lands in **Family-scoped blob** (verified); **no raw photo
  rendered** anywhere (ADR-0020/0021); missing Bearer → **401**; dev sample photos only;
  no secret committed.

## Verification-command (issue 88)

```bash
npm test -- mobile-form-data && npm run check:runbook
```
Proves the FormData builder (closes B1) + runbook internal consistency. The
202/blob/no-raw-render checks are real-key HITL, recorded in the runbook table.

## State / facts confirmed this session

- Only mobile FormData builder is `family/new.tsx`; it already uses the helper. Mobile
  Moment upload (`createMoment`) is **JSON-only**, not a blob upload — a future issue-71
  gap, not a regression, out of scope here.
- `npm run check:runbook` → `scripts/check-hitl-runbook.mjs` exists and validates
  sections/commands/paths/ADRs/no-secrets. Runbook §2 = Family & roster.
- GH issue creation for 88 was **denied by the auto-mode classifier** (external
  publish). Canonical tracker is the markdown file; create the GH mirror via
  `gh issue create` with `ready-for-agent` if/when wanted.

## Not done / follow-ups

- **GH issue 88** not filed (see above) — optional.
- **`/part2` starts at issue 88** (Gate 0), then proceeds to v10 issues 83–87.
- Web `live-app-audit` run still pending — **on the user's signal only.**

## Suggested skills

- `/part2` — issue **88** (Gate 0), then 83 → 87.
