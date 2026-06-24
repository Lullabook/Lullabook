# PRD v16 — R1 Ruthless Cut: solo, no audio, no multi-family, US-only

> Status: ready for agent. Planning artifact from `/part1` (2026-06-23). Sits on top of
> PRD v14 (R1 release) and refines its scope per the founder's call. Decisions & invariants
> locked in [`r1-simplify-test-logging-invariants.md`](r1-simplify-test-logging-invariants.md).
> Paired with [PRD v17](prd-v17-test-framework-and-logging.md) (verify + capture).

## Why this wave

R1's job is one promise: **a single parent makes one real, illustrated, bedtime story
starring their baby, and keeps it (PDF).** Everything that doesn't serve that promise is not
"nice to have for R1" — it's *a way for R1 to break*. The app reads as "it doesn't work" partly
because too many half-built surfaces are reachable. This wave cuts the surface down to the
promise and **enforces each cut as a server-side gate with no dead UI** — because a half-removed
feature (a dead button, a 500-ing endpoint, a spinner that never ends) is worse than a finished
one.

This refines, and in two places amends, the scope locked in PRD v14:

- **Cuts that v14 already implied, now enforced as inert:** audio, multi-family.
- **A long pole v14 flagged, now committed:** US-only for R1.0 (Asia = R1.1 fast-follow).
- **One thing v14 over-cut, now restored (minimally):** Daily Notes capture stays.

## Locked decisions (from the grill)

**Cut entirely (deferred to R2, gated server-side, no reachable UI):**
- **Audio** — voice clips, voice messages, lullaby weave, AI narration.
- **Multi-family** — invited members, family logins, the "Our Whole Family" collaborative
  plan, multi-baby households. R1 is **solo Guardian, one baby**.
- **Subscription** — the collaborative/family plan is cut; R1 sells **solo plan(s) only**.
- **Asia market** — the multi-jurisdiction engine ships config-driven but **US-only** for
  R1.0; Asia is a flagged-off R1.1 fast-follow.

**Kept:**
- **Story creation** — illustrated Bedtime storybook generation (the v14 Track A centerpiece).
- **Daily Notes** — lightweight daily Moment capture (solo, one baby). The heavy machinery
  (Story Context Engine, Firsts, Birthday Story, weekly suggestion, photo-to-story,
  auto-context injection) **stays deferred**.

Full table + ADR amendments (0024 solo-only, 0025 solo plan, 0015 US-only) in the decisions doc.

## Scope → tracks

| Track | Theme | Issues |
|-------|-------|--------|
| **S1 — Cut audio** | Disable voice/narration server-side; remove record/play UI; prove inert | 145 |
| **S2 — Cut multi-family** | Disable invite/invited-member/voice-message endpoints; solo-Guardian create-rights; one-baby-per-Household; solo plan only (refines 129) | 146 |
| **S3 — US-only jurisdiction** | Enable US market only, config-driven; Asia flagged-off fast-follow | 147 |
| **S4 — Keep Daily Notes, defer the rest** | Daily note capture works solo; Story Context Engine / Firsts / Birthday / weekly suggestion gated off | 148 |
| **S5 — Dead-UI / dead-endpoint sweep** | The done-signal: a check asserting **no deferred feature has reachable UI or an open endpoint** | 149 |

Build order S1 → S2 → S3 → S4 → S5. S5 is the wave's acceptance gate: it proves the cut is a
*cut*, not a *hide*.

## Invariants (acceptance constraints — restated from the decisions doc)

### Latency / performance
- The cut must not regress R1 budgets (Demo Story < 1s; cold start < 3s; reader page turn
  < 100ms; storybook detail payload < 500KB). Cold start should **shrink**, not grow.

### Failure modes
- Every deferred feature **fails as "absent," never as an error**: no dead button, no endpoint
  that 500s, no spinner without a terminal state. A disabled endpoint returns a clean
  `404`/`403`.
- US-only jurisdiction: a non-US request rides the same config path (clean message or US
  default), never a hardcode, never a crash.

### Security / permission boundaries
- Cutting multi-family **closes authz holes, not opens them**: family-invite, invited-member,
  and voice-message endpoints **disabled server-side**; create-rights default
  **solo-Guardian-only**; one-baby-per-Household enforced server-side. The server gate *is* the
  cut — hiding a button is not.
- All R1 boundaries still hold (Baby Persona gated by `consent_verified`; raw child photos
  write-only; likeness egress only via PDF Export; hard-delete always available; secrets
  server-side only).

## Notes / risks
- **Don't delete, gate.** Keep the cut code behind config (as issue 129 already does for the
  two-plan model) so R2 re-enables by flag, not by re-build.
- **Overlap with in-flight work:** R1 Track A (issues 122–126) is being implemented now; this
  wave's issues touch *different* surfaces (audio, family, jurisdiction, journal) and the
  paywall (refining 129, Track B, not yet built). No collision with Track A.
- **ADR-0026** ("R1 simplification scope") is worth recording but not blocking; flagged in the
  decisions doc.
