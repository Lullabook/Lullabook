## Now

- 2026-08-04 reviewer drained Review Ready: #202 (RevenueCat lifecycle) and #205 (hard-delete/RLS evidence) both **PASS → Done**. Queue empty. Handoff `SESSION-HANDOFF-2026-08-04-reviewer-202-205.md`. PRD v22 implementation tickets on the board are Done; live/human release evidence remains BLOCKED by design.
- #203/#205 live-evidence parts (native smoke, real provider IDs, billing
  reconciliation, real RLS/hard-delete, human sign-offs) report BLOCKED by design;
  require wayfinder #135/#150 + fresh approvals.
- #193 (parent index) is doc-only — flagged for /reviewer or a human to close.
- #206-#209 (iPhone device dev build) planned by a parallel planner on the same
  branch — user-owned, do not build without instruction.
- Gotchas unchanged: `.env.example` needed for verify; Metro binds `[::1]` on this
  machine (ipv4-metro-proxy); verify now has a 30s vitest test timeout (pg-embedded)
  and Playwright SKIPs honestly on ETIMEDOUT.
## Recently tried

- **Token benchmark, graph vs raw `CONTEXT/`** (2026-07-29, cl100k). Three
  questions, cost = tokens that must enter context to answer *correctly*.
  Raw baseline = file list (4,948 tok) + grep output + every file the grep
  surfaces that can't be ruled out without opening it.

  | question | raw | graph | save |
  |---|---|---|---|
  | current monetization model | 35,593 | 7,768 | 78% |
  | storage provider and why | 23,419 | 5,968 | 75% |
  | open issue about PDF export | 11,491 | 1,350 | 88% |
  | total | 70,503 | 15,086 | **79%** |

  Whole vault read end-to-end: 144,641 tok.

  The PDF question was **−8%** on the first run: `index-issues.md` held all 176
  issues at 11,295 tok, more than grepping the folder. Splitting live from
  settled (below) fixed it to +88% and took the total from 63% → 79%.

  Correctness, not just cost: the monetization answer needs the chain
  0009 → 0023 → 0025 → 0028. Reading the 5 plausible-looking files raw costs
  11,515 tok and returns the **wrong** answer (stops at 0025, misses that
  ADR-0028 supersedes its R1 price and Story cap). The index line carries the
  status, so the graph sees the reversal without opening anything.

## Dead ends — do not retry

- (nothing logged yet)

- **Issue index split live from settled** (2026-07-29). `build-graph-index.mjs`
  now emits `index-issues.md` (20 open, 897 tok) and `index-issues-closed.md`
  (156 settled, 10,433 tok); ROUTER points at both. 20 + 156 = 176, nothing
  lost. A node with **no** status counts as live, so an unlabelled issue can
  never silently vanish from the open list.

## Open questions

- (nothing logged yet)
