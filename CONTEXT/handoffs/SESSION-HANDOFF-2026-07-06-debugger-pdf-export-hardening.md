# Session Handoff — /debugger review pass over the PDF-export build (v18 chain complete)

> Date: 2026-07-06. Type: `/debugger` code-review chain (reuse agent → four-net audit →
> fix → fresh-eyes review → handoff → push) over the PDF-export surface built by
> `/coder` (commit `14ee86a`, issues 160–161) plus the standing `mobile/` sweep.
> Branch `feat/prd-v18-pdf-export`, PR #112. This closes the founder's one-shot
> `/planner → /coder → /debugger` run for PRD v18.

## The full v18 chain, for orientation

1. `/planner` (2026-07-05): PRD v18 + issues 160–161, invariants E1–E6 — merged as PR #111.
2. `/coder` (2026-07-05): both issues built test-first; fresh-eyes red-team PASS,
   no defects; five optional hardenings recorded — pushed as commit `14ee86a` (PR #112).
3. `/debugger` (this pass): the five hardenings seeded a four-net audit; **four confirmed
   as real bugs and fixed**; a second fresh-eyes checker reviewed the fixes **PASS, no
   defects**.

The `debugger-lullabook` auditor agent was reused verbatim (idempotent). One maker
instance stalled twice on a stream watchdog and was replaced by a fresh spawn — no
work was lost (state rebuilds from disk).

## Four-net audit results

- **(a) failing tests / (b) static errors:** none (baseline VERIFY-EXIT:0; eslint 0
  app-source errors).
- **(c) invariant violations — 3 confirmed, fixed:**
  - **BUG-1 — cross-tenant existence oracle** (security boundary): the finalize and
    export routes surfaced `RlsViolationError`'s message ("Cannot read storybook for
    another family") verbatim in the 400 body, letting a stranger distinguish
    "exists, another family's" from "no such book". Both routes now map RLS
    violations to the same `{ error: "Storybook not found" }` 400 as unknown ids —
    checker verified the bodies are byte-identical and owner-facing errors ("Only
    drafts can be finalized", draft-export message) still pass through.
  - **BUG-2 — finalize/refetch stale-UI edge (E4):** a successful finalize whose
    refetch failed left a re-confirmable "Finalize keepsake" CTA on stale draft UI.
    New `finalizedOnServer` state (set only on route success — never a local status
    flip) gates the CTA and shows a truth-telling reload card wired to `load()`.
  - **BUG-3 — inconsistent 401 handling (widened from the seed):** export/finalize
    401s showed inline "Unauthorized" cards while `load()` redirects to sign-in; the
    same class existed in pre-existing `rerollCurrent`/`pickCandidate`. All four
    action handlers now redirect, matching `load()`.
- **(d) weak/uncovered tests — 1 confirmed, fixed:** the export route had no
  cross-tenant probe (finalize did). Added.

All four fixed test-first in **`tests/162-pdf-export-hardening.test.ts`** (10 tests,
9 red pre-fix). Refuted as bugs: E5 canon, E1/E2 download contract, E6 web gate,
likeness render boundary — all clean.

## Fresh-eyes checker review (maker ≠ checker): **PASS — no defects**

Independent gates: 160+161+162 → 39/39; `npm run verify` VERIFY-EXIT:0;
`npx eslint mobile` 0 app-source errors. Mutation testing: 4/4 mutations (export
oracle mapping removed, finalize oracle mapping removed, `finalizedOnServer` gate
removed, one 401 redirect removed) each killed by exactly one targeted 162 test —
independent guards, not tautologies. No mutation residue; tests/160–161 untouched.

## Follow-ups (honest, none blocking)

1. **Same oracle class on the reader GET route** (`src/app/api/storybooks/[id]/route.ts`
   — unhandled `RlsViolationError` → 500 on a cross-family probe; reroll/select-candidate
   routes may share the pattern). Out of this pass's scope amendment; frame as the next
   review issue.
2. **Post-commit finalize-request failure** — if the finalize POST itself dies after the
   server committed, retry shows a raw "Only drafts can be finalized" on a draft-looking
   screen. Narrow edge; could treat that message as success.
3. **401 detection is message-substring based** (repo convention); a status-code channel
   through `apiFetch` would be sturdier.
4. **Maestro flow still unexercised** (no Simulator in this environment) — needs the
   live-device pass, which is also what measures **E1's 30s p95** (F3) on hardware.
5. **Billing copy question remains with the founder**: "Founding families get the first
   month free after the trial" — confirm real or cut (honesty invariant).

## Next session

- **Live-device sweep** on the physical iPhone (Expo Go recipe in
  `SESSION-HANDOFF-2026-07-05-debugger-mobile-review-2.md`): full loop upload → persona →
  generate → read → finalize → export PDF; run the Maestro flow; measure E1 p95 and
  cold start on hardware.
- Or `/debugger` again to close follow-up 1 (reader-GET oracle) as its first framed bug.

## Reference

- PRs: #111 (plan, merged), #112 (build + this hardening).
- Audit log: session scratchpad `debugger-audit-log-2.md`.
- Prior handoffs: `SESSION-HANDOFF-2026-07-05-planner-prd-v18-pdf-export.md`,
  `SESSION-HANDOFF-2026-07-05-coder-160-161-pdf-export.md`.
