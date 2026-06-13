# ANTIGRAVITY — Fix the 8 shared-service bugs in the Lullabook backend

> **You are Antigravity, the review/coach agent for Lullabook.** Run this **after
> Cursor has finished the native iOS slices (issues 23–31)**. Your job is a
> focused, test-driven cleanup pass: **verify and fix 8 known bugs** in the shared
> domain/service layer that the 2026-06-12 code review found. These bugs sit on
> the same services the web app and the new native app both use, so getting them
> right protects every surface.
>
> Path to this prompt: `docs/ANTIGRAVITY-WEB-BUGFIX-PROMPT.md`

---

## 0. Operating context — read these first, in order

1. `README.md` (repo root) — what the system is, how to run it, current gaps.
2. `CONTEXT/CONTEXT.md` — the canonical **glossary**. Use this vocabulary
   everywhere (Family, Member, Guardian, Persona/Baby/Adult, Character, Storybook,
   Page, Brief, Style Bible, Consent receipt, Hard-delete, Email-Plus VPC,
   Subscription). Banned synonyms: "soft delete", "Parent Persona", "remix",
   "country" for jurisdiction.
3. `AGENTS.md` (repo root) — the project rules every agent loads.
4. `CONTEXT/docs/adr/` — the load-bearing decisions. The bugs below each map to an
   ADR they currently violate (noted per bug). **Respect the ADRs.**
5. `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-13.md` and the
   `SESSION-HANDOFF-2026-06-12_2.md` it points back to — where these bugs were
   first catalogued (the high `/code-review`).
6. **Your coach pass (optional but recommended):** run
   `bash tools/kaizen-coach/coach.sh` and follow `tools/kaizen-coach/COACH.md` to
   align the code with the glossary + ADRs while you are in here.

**What this project is:** Lullabook (provisional name) is an app where a parent
generates AI **Storybooks** starring their own baby and family. A complete
**web app** exists (Next.js + Supabase + per-Family **RLS** + Inngest durable
workflows + an Anthropic/fal generation pipeline), and Cursor has just added a
**native iOS app** (`/mobile`, Expo) over the same backend. The backend is the
single source of truth; **do not fork or duplicate domain logic.**

---

## 1. Important: these bugs were also folded into Cursor's native issues

The 8 bugs were listed as acceptance criteria inside native issues **24, 26, 27,
30**, with the intent that Cursor fix each while touching that service. So **some
or all may already be fixed** by the time you run.

Therefore, for **each** bug below, work in this order:

1. **Verify current behavior** — write a failing test (or run the suite) that
   pins the *correct* behavior. If it already passes, the bug is fixed: keep the
   **regression test** you just wrote (it's still valuable) and move on.
2. **If it still reproduces**, fix it (red → green).

Line numbers below are **as of 2026-06-12** and the native work has shifted the
files — **locate each bug by behavior, not by line number.**

---

## 2. The 8 bugs — verify, then fix

Each: where it lives, the wrong behavior, the correct behavior, and the ADR it
protects.

### Bug 1 — Baby Character→Persona promotion is hardcoded to `adult`
- **Where:** `src/workflows/functions.ts` (the persona-create workflow body;
  `kind: "adult"` was hardcoded ~line 114), `PersonaCreatePayload` (~line 75),
  and `promoteCharacterAction` in `src/lib/actions.ts`.
- **Wrong:** promoting a **baby** Character through the workflow produces an
  **Adult** Persona, because `kind` is hardcoded and not threaded through the
  payload/action. The existing test passed only because it called the service
  directly, **bypassing the workflow**.
- **Correct:** thread `kind` (`baby | adult`) through `PersonaCreatePayload` and
  `promoteCharacterAction`; the workflow uses the real `kind`. A baby promotion
  yields a **Baby Persona**.
- **Test:** assert promotion **through the workflow** (not by bypassing it).
- **Protects:** ADR-0016 (Character→Persona upgrade), ADR-0006 (Guardian/Baby).
- **Note:** this is on the native app's **core paid path** — get it right.

### Bug 2 — Hard-delete leaves child PII behind
- **Where:** `hardDeleteFamily` in `src/db/store.ts` (~line 221); interacts with
  `SupabaseDataStore.sync()`.
- **Wrong:** `hardDeleteFamily` never clears `textStories`, `pendingBriefs`,
  `moderationAudit` (and now `push_subscriptions` if Cursor added it). Because
  `sync()` upserts every in-memory map and only deletes ids **missing** from it,
  the un-cleared rows get **re-written to Postgres** — an erasure violation.
- **Correct:** `hardDeleteFamily` removes **all** of the Family's rows across
  **every** map — `textStories`, `pendingBriefs`, `moderationAudit`,
  `push_subscriptions`, and anything else Family-scoped — and `sync()` does **not**
  re-upsert them.
- **Test:** extend the cross-store delete test (`tests/12-hard-delete.test.ts`):
  after hard-delete, assert those rows are gone **and stay gone after a sync**.
- **Protects:** ADR-0007 (data lifecycle / right to be forgotten).

### Bug 3 — A `failed` Storybook can never be recovered
- **Where:** `finalizeStorybookStatus` in `src/services/storybook.ts` (~line 418):
  `if (!storybook || storybook.status !== "generating") return;`.
- **Wrong:** the early-return means once a book is `failed`, re-rolling its holes
  can never move it back to `draft`.
- **Correct:** a book that reaches its ready-Page floor after recovery can
  transition `failed → draft`. Allow the finalize check to run for a recovering
  book, not only a `generating` one.
- **Test:** a `failed` book whose Pages are recovered reaches `draft`.
- **Protects:** ADR-0004 (curated, recoverable Storybook).

### Bug 4 — Selected re-roll candidate is dropped and bypasses moderation
- **Where:** `selectCandidate` in `src/services/storybook.ts` (~line 496):
  `page.illustrationUrl = candidate.content;`.
- **Wrong:** it writes `illustrationUrl`, but the reader and PDF export key off
  `illustrationBlobKey`, so the selection is effectively dropped; it also routes a
  raw URL rather than the moderated, stored blob.
- **Correct:** `selectCandidate` sets the page's `illustrationBlobKey` to the
  chosen candidate's **moderated, persisted blob**; readers/export show it. A
  candidate is only selectable if it passed moderation and was stored.
- **Test:** after selecting a candidate, the reader/export resolve via
  `illustrationBlobKey`; an unmoderated candidate cannot be selected.
- **Protects:** ADR-0010 (moderation before persist/serve), ADR-0007 (blob store).

### Bug 5 — Failed persona-create strands the Persona in `training`
- **Where:** the persona-create workflow catch in `src/workflows/functions.ts`.
- **Wrong:** on training failure there is no status flip, so the Persona is stuck
  in `training` forever.
- **Correct:** a failed training flips the Persona to `failed` (its terminal
  failure state), so the UI can show it and offer re-train.
- **Test:** a faked training failure leaves the Persona `failed`, not `training`.
- **Protects:** ADR-0002 (per-Persona LoRA lifecycle `training → ready/failed`).

### Bug 6 — `pageRecover` has no terminal-failure handler
- **Where:** the page-recovery path in `src/services/storybook.ts`.
- **Wrong:** when a Page's recovery retries are exhausted, there is no terminal
  handler, so it does not settle into a hole.
- **Correct:** an exhausted recovery settles the Page as a terminal
  `failed`/`quarantined` **hole** (still re-rollable by the parent), never an
  infinite/again-pending state.
- **Test:** a Page whose recovery exhausts becomes a terminal re-rollable hole;
  the book can still reach `draft`.
- **Protects:** ADR-0004 (failed Pages are holes, not blockers).

### Bug 7 — Text moderation can be bypassed by a non-numeric class score
- **Where:** `src/adapters/moderation.ts` — `moderation_classes` is typed
  `Record<string, number | string>` and the threshold compare assumes a number
  (~line 93/96).
- **Wrong:** a non-numeric (string) class score slips past the `>= threshold`
  comparison, so unsafe text can pass — **fail-open**.
- **Correct:** **fail closed.** Coerce/validate each score to a number; a missing
  or non-numeric score is treated as a **failure** (or hard error), never a pass.
- **Test:** a non-numeric class score causes the text to be **blocked**.
- **Protects:** ADR-0010 (child-safety defense-in-depth — never fail open).

### Bug 8 — `sync()` serializes ~34 round-trips per step commit
- **Where:** `SupabaseDataStore.sync()` in `src/db/supabase-store.ts`.
- **Wrong:** each step commit serializes ~34 sequential round-trips, a real
  latency/cost drag on every workflow step.
- **Correct:** batch the writes (group upserts/deletes per table, or parallelize
  independent ones) so a commit is a handful of round-trips. **Behavior must be
  identical** — this is a performance fix only; do not change what is persisted.
- **Test:** assert the persisted result is unchanged; if practical, assert the
  round-trip count drops (counting fake) — but never trade correctness for speed.
- **Protects:** ADR-0011 (backend architecture / durable workflow efficiency).

---

## 3. How to work

- **TDD, every bug:** red (a failing test pinning correct behavior) → green (the
  fix) → keep refactors small. Where a bug is already fixed, keep the regression
  test anyway.
- **Test at the service / use-case seam with provider adapters faked** (Anthropic,
  fal.ai, moderation, blob store, Resend, liveness, workflow). Do **not** test
  vendor SDK internals, Stripe/RevenueCat internals, or React/React-Native render
  details. This is the project's established pattern — mirror the existing
  `tests/*.test.ts`.
- **Keep the whole suite green.** Run the full test suite before and after; the
  web tests (105+ before native, more after Cursor) plus any new ones must pass.
- **Match existing style** and the glossary; new code reads like the code already
  there. No duplicated domain logic; the services stay the single source of truth.
- **Do not weaken RLS or per-Family isolation.** Do not touch the native app
  (`/mobile`) unless a fix in the shared layer requires a trivial follow-through.
- **No secrets committed.**

---

## 4. Prior-art tests to mirror

- `tests/12-hard-delete.test.ts` — cross-store erasure (Bug 2).
- `tests/06-generate-storybook.test.ts` — generation, per-Page isolation, recovery
  (Bugs 3, 4, 6).
- `tests/05-child-safety.test.ts` — moderation (Bugs 4, 7).
- `tests/03-adult-persona.test.ts` / the persona-create flow — (Bugs 1, 5).
- `tests/adapters.test.ts` — adapter fakes.

---

## 5. Self-verify checklist (walk it before reporting done)

- [ ] Each of the 8 bugs has a test that pins the **correct** behavior (whether it
      was already fixed or fixed by you).
- [ ] Bug 1 is tested **through the workflow**, not by bypassing it.
- [ ] Hard-delete (Bug 2) leaves nothing re-upsertable by `sync()`.
- [ ] Moderation (Bug 7) **fails closed** on a non-numeric score.
- [ ] `selectCandidate` (Bug 4) resolves via `illustrationBlobKey` and only allows
      moderated, stored candidates.
- [ ] `failed` books recover (Bug 3); exhausted page recovery settles as a hole
      (Bug 6); failed training settles `failed` (Bug 5).
- [ ] `sync()` (Bug 8) persists identical results with fewer round-trips.
- [ ] Full test suite green; `npx tsc --noEmit` + lint clean for the root app.
- [ ] No glossary/ADR violations introduced; no domain logic duplicated.

## 6. Output / handoff

- Work on a branch (e.g. `fix/web-shared-service-bugs`); open a PR (or push the
  branch) so it can be reviewed and merged.
- Run `/handoff` and `/push-handoff` at the end.
- End your final message with: a per-bug status (already-fixed vs fixed-by-you,
  with the test that proves it), the green-suite state, and any glossary/ADR
  drift the Kaizen coach surfaced.
