# Session handoff — /planner PRD v23 full-likeness family demo

**Date:** 2026-08-06
**Stage:** planner (Opus, Claude Code)
**Branch:** `feat/prd-v22-186-205`
**Project:** VrajGupta/Lullabook project 3 (`PVT_kwHOCFvJwM4BfNMa`)
**Spec:** `CONTEXT/planning/prd-v23-full-likeness-demo.md`

## The problem this plan solves

PRD v22 closed with every ticket `Done` and 1225 deterministic tests passing,
yet the Guardian cannot run the app with Stories and Family members in it. The
gap is not coverage. **The live provider path has never run once.** No LoRA has
been trained on fal.ai, `LIVE_PROVIDER_RUN_APPROVED` has never been set, and no
training callback has ever arrived from the public internet.

## Sizing gate

Recommended **against** a `/wayfinder` pass. The destination was nameable and
`/wayfinder` would have cost 2 to 3 of 14 days. Ticket 202, a collaborative
reproduction session with the Guardian, replaces it.

## Locked decisions

Twenty decisions, D1 to D20, are in the spec. The load-bearing ones:

- Simulator is the working target, built and framed as an iPhone app. The real
  iPhone is the destination and is **non-negotiable**, not a fallback rung.
- Real FLUX LoRA likeness for a **full five-person roster**. Placeholder art is
  not an acceptable demo.
- Consent gate and moderation hold in full on the live path.
- Sonnet 4.6 stays for Story text. The cheap-model swap saves about `$0.07` per
  book and would put the twelve-Page contract back into test.
- **fal.ai budget is `$20`.** Agents spend freely within it. Only the Guardian
  raises it.
- Photos are **user-owned**: folder `lullabook family testing` plus a handover
  document. Training cannot start before they exist.
- Apple Developer and EAS are bought on an **explicit user signal**, never a
  date trigger.
- Vercel for training and the demo. Local dev for polish only.
- Prime Intellect is **off the critical path**. Evidence: `prime train` runs the
  `prime-rl` container over verifiers environments, which is RL for language
  models. It cannot train a FLUX image LoRA.

### The one assumption, stated not hidden

The demo family's country was never put on the record, and it sets the child-age
threshold for the 14-year-old. Rather than guess, ticket 207 keeps the threshold
in configuration per ADR-0015, and the demo defaults to the **strictest** launch
jurisdiction (`< 18`), so both minors need verified parental consent. A looser
threshold routes the same code path to self-consent with no code change.

## Invariants

Named and testable in the spec: `LAT-1` to `LAT-7`, `FAIL-1` to `FAIL-9`,
`SEC-1` to `SEC-9`, `ENT-1`, `COST-1` to `COST-3`. New this round:

- `LAT-5` one training terminal within 25 minutes, never an unbounded spinner.
- `FAIL-4` a training whose callback never arrives is reconciled by polling.
- `FAIL-6` an unreachable callback URL fails **before** money is spent.
- `SEC-2` consent is per minor, never per Family.
- `SEC-8` the minor threshold is jurisdiction configuration, never hardcoded.
- `COST-1` and `COST-3` the `$20` cap is a fail-closed reservation, and a second
  full retrain round stops and asks.

## Slice order

Dependency-ordered. Local ids map to GitHub issues.

| Local | Issue | Status | Blocked by |
|---|---|---|---|
| 202 reproduce live failures | #213 | Agent Ready | — |
| 203 Vercel public callback URL | #214 | Agent Ready | — |
| 204 `$20` spend cap fail-closed | #215 | Agent Ready | — |
| 214 branding audit | #225 | Agent Ready | — |
| 217 server-granted demo Pro | #228 | Agent Ready | — |
| 205 live fal auth + JWKS | #216 | Planned | 203, 204 |
| 206 photo intake | #217 | Planned | 202 + **the Guardian** |
| 207 five-Persona consent roster | #218 | Planned | 206 |
| 208 five real LoRA trainings | #219 | Planned | 205, 207 |
| 209 likeness confirm + resume | #220 | Planned | 208 |
| 210 Story text, five Personas | #221 | Planned | 209 |
| 211 multi-Persona illustration | #222 | Planned | 210 |
| 212 Simulator end-to-end demo | #223 | Planned | 211, 217 |
| 213 visible design polish | #224 | Planned | 202 |
| 215 iPhone device build | #226 | Planned | 212 + **user purchase signal** |
| 216 Prime GEPA evaluation | #227 | Planned | off critical path, user-owned |

## Next agent starts at ticket 202 (#213)

Four other tickets are claimable in parallel: #214, #215, #225, #228. They share
no files with 202.

## Where the two weeks is at risk

1. **Ticket 206 is Guardian-owned and has the longest lead time.** Nothing from
   207 onward can start until the photo folder and handover document exist. This
   is the single largest schedule risk and it is not an agent's to remove.
2. **Ticket 208 is the riskiest engineering work.** It is the first live run
   ever. Expect the first attempt to fail on credentials, ZIP shape, or callback
   signature.
3. **Apple approval takes 24 to 48 hours or longer** and is outside anyone's
   control. Ticket 215 cannot start until the Guardian signals the purchase, so
   the earlier that signal comes, the safer the iPhone goal.

The critical chain is 202 → 206 → 207 → 208 → 209 → 210 → 211 → 212 → 215. Ten
of the sixteen tickets sit on it.

## Deferred, filed, not lost

- Cheap-model bake-off for Story text, after the demo.
- Prime Intellect GEPA on the Story prompt (#227), user-owned.
- Stripe and web payment, a post-demo release concern.
