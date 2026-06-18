# Session Handoff — 2026-06-18: skill guardrails + GitHub issue reconciliation

> Meta session — **no app code changed.** Two things happened: (1) the global
> `/part1` and `/part2` orchestrator skills gained production guardrails, and
> (2) GitHub issues **#18–24 (project issues 75–81)** were verified against the
> codebase and **all closed** as code-complete. Repo working tree is otherwise
> unchanged from the prior session.

## 1. Skill guardrails (live outside this repo)

Per developer feedback ("who is the adult in the room when the agent is
confidently wrong"), both orchestrator skills now carry explicit safety gates.
**These files are NOT in the Lullabook repo** — they live at
`~/.claude/skills/{part1,part2}/SKILL.md`. Re-sync to other machines manually
from this section.

### `/part1` — new invariants gate before `to-prd`
New **step 2 "Lock invariants"** between `grill-with-docs` and `to-prd`. Before
the PRD is written, three categories must be made explicit and testable:
- **Latency / performance budgets** — concrete numbers (p95, cold start, payload), not "fast".
- **Failure modes** — per dependency: down / slow / rate-limited / garbage → what the user sees, retried vs. surfaced vs. degraded.
- **Security / permission boundaries** — authz, trust edges, data exposure, blast radius.

`to-prd` and `to-issues` must now carry these forward as explicit acceptance
constraints. New rule: if the grill couldn't pin an invariant, that's an open
decision to resolve with the user — not something the PRD papers over. Description
+ handoff step updated to name the gate.

### `/part2` — new red-team pass after the build
New **step 3 "Red-team pass"** between `tdd` and `handoff`. Don't re-run the happy
path; attack the corners:
- **Weird inputs** — empty/null/oversized/wrong-type/malformed/duplicate/unicode-injection/out-of-range/concurrent.
- **Failure modes** named in the `/part1` invariants (dependency down/slow/erroring).
- **Permission & boundary edges** — wrong user, missing/expired/forged token, privilege escalation, cross-tenant access.

Then **verify the `/part1` invariants actually hold**. Fix breaks test-first;
record genuinely out-of-scope gaps honestly in the handoff. The handoff now
reports what the red-team pass tried and found; rules forbid skipping it before
handoff. Description/intro/summary updated.

**The two skills are now wired together: `/part1` defines the invariants,
`/part2` attacks them.**

### Open question — the missing 3rd guardrail
The feedback said "3 guardrails" but only spelled out **two** (invariants +
red-team); the third was cut off. Proposed candidate, not yet added: a
**pre-push gate** (in `push-handoff` or end of `/part2`) that blocks the push if
the suite is red, type-check/lint fails, or the red-team found an
unaddressed-and-unrecorded issue. **Decision owed from the user** before adding.

## 2. GitHub issue reconciliation (#18–24 → all closed)

The PRD v9 mobile wave (issues 75–81) was implemented in commit `3e87ed4` (225
tests green) per `SESSION-HANDOFF-2026-06-16-prd-v9-mobile-wave-complete.md`, but
the issues were still **open** on GitHub. Each was re-verified against the actual
code this session, then closed.

| GH | Issue | Verified | HITL follow-up still owed |
|----|-------|----------|---------------------------|
| #18 | 75 Journal capture+timeline | `daily.tsx` wired to create/listMoments, old TODO + mock gone | Simulator persist-across-reload pass |
| #19 | 76 Firsts view + "Make this a Story" | Firsts filter + seeded create-flow offer | Simulator pass |
| #20 | 77 Storybook Bearer API | both routes + typed clients; service-seam tested | none (backend-only) |
| #21 | 78 Storybook generation | `storybooks/new.tsx` Brief→generate→poll | illustrated-generation HITL (real pipeline) |
| #22 | 79 Storybook reader | `storybooks/index.tsx` + `[id].tsx` paged reader | Simulator reader pass |
| #23 | 80 Wire stubbed handlers | char GET/PUT, family create, account hard-delete (Alert = required confirm gate) | none explicit |
| #24 | 81 Social-only auth | sign-in/sign-up Apple+Google; email/pw is `__DEV__`-gated escape hatch only | Supabase Google provider config + Apple-ID device/Simulator pass |

Per user decision: closed all 7 as code-complete; remaining work is **HITL
Simulator verification**, tracked below rather than as open issues. Each closed
issue carries a closing comment noting its specific follow-up.

## 3. Carried-forward / still-pending (from prior handoffs)

These are NOT new — they survive from `SESSION-HANDOFF-2026-06-16-prd-v9-mobile-wave-complete.md`:
- **HITL Simulator passes** for the Journal → Storybook happy path (issues 75/76/78/79) — now the main outstanding work since code is done.
- **Issue 70** — authenticated Add-Family photo upload end-to-end still needs Simulator HITL.
- **Google OAuth** — needs Supabase Google provider + redirect URL configured before #24's HITL can pass.
- **Apple Sign-In** — Simulator needs an Apple ID; native button hidden when unavailable.
- **Payment `/part1`** — deferred per PRD v9 (Free + paid + credits recorded; own future planning pass).

## 4. Repo working-tree note (not touched this session)
Uncommitted artifacts left from prior sessions, intentionally **excluded** from
this handoff's commit: `appaudit-report-*.md` (11), `COMPOSER_25_DEBUG_PROMPT.md`,
new repo-local skill dirs `.claude/skills/{live-app-audit,xcode-ios-dev}/`,
`next-env.d.ts` (generated), and the macOS dupe `test-results 2/`. Clean these up
or `.gitignore` them in a future session if unwanted.

## Suggested next
- Run the HITL Simulator passes (Journal/Storybook happy path) to fully satisfy the closed issues' acceptance criteria.
- Configure Supabase Google provider + redirect; test Apple/Google sign-in on device.
- Get the user's call on the **3rd guardrail** (pre-push gate) and add it if confirmed.
- Payment `/part1` when ready.

## Suggested skills
- `hermes` / `xcode-ios-dev` — Simulator HITL verification.
- `/part1` — payment planning, or to add the pre-push guardrail.
- `lullabook-design-check` — if polishing mobile screens further.
