# PRD v19 — Working core loop: real story generation, photo-training fix, Journal + Learning restored, UI polish

> Grilled 2026-07-06 (hands-on iOS Simulator QA). Turns a live-QA feedback bundle into an
> ordered build. Reverses part of the PRD v16 ruthless cut per
> [ADR-0026](../docs/adr/0026-restore-journal-and-learning-uncut-r1.md). Everything else
> PRD v16 cut (audio, multi-family, Asia) stays cut. Branch: `feat/prd-v19-working-core-loop`.

## Why

The core R1 promise — *a solo parent makes one illustrated Bedtime story starring their
baby, kept as a PDF* — does not currently work end-to-end on device:

- **Story generation lands `failed` with zero pages.** `POST /api/storybooks` ran 51s and
  returned 201, but the book reached `failed` and the reader showed "No pages yet." Keys are
  present (`ANTHROPIC_API_KEY`, `FAL_API_KEY`) and the model id `claude-sonnet-4-6` returns
  HTTP 200, so this is a runtime throw in the text→page pipeline, not a config/auth gap.
- **Photo-training upload throws "Unsupported FormDataPart implementation"** on Start
  training (`mobile/lib/form-data.ts` — the RN `{uri,name,type}`-as-`Blob` file part is
  rejected by the Expo SDK 56 / RN 0.85 stack), so a Baby Persona (trained likeness) can
  never be created on device.
- Two features the owner wants back — the **Journal** and the **Learning** story type —
  were deliberately cut in R1 (now un-cut per ADR-0026).
- UI polish: the **Back** button styling, hurried/placeholder **emoji symbols**, and the
  **billing Annual/Monthly toggle** clipping its own label.

## Decisions locked in the grill (2026-07-06)

1. **Un-cut Journal + Learning this release** (ADR-0026). Audio, multi-family, Asia stay cut.
2. **Everything together** — one combined effort, dependency-ordered (bugs → restored
   features → polish), no hard phase gates.
3. **Placeholder art now.** Generation must produce a **viewable book without a trained
   likeness**: a Character-only (photo-free) or persona-free Brief yields a text-viewable
   draft with **placeholder/generic art**, never a `failed` book. Real likeness training
   (the FormDataPart fix) is wired in parallel so it is ready right after, but the core loop
   no longer depends on it.

## Invariants (acceptance constraints — every issue that touches these restates them)

### I1 — Latency / performance budgets
- **I1.1** Story text pass p95 **< 25s** locally for an ≤8-page book; whole-book generation
  p95 **< 90s** locally (the existing generation watchdog budget is the hard ceiling — a run
  past it is reaped to `failed`, never left `generating`).
- **I1.2** Journal timeline first paint p95 **< 300ms** on the in-memory/local store for a
  Baby with ≤200 Moments; capture (log a Moment) round-trips **< 1s** locally.
- **I1.3** Photo upload accepts up to **10** images per member; the request streams (no
  full base64-in-memory blow-up) and shows in-progress state within one frame.

### I2 — Failure modes (each external dep: down / slow / rate-limited / garbage)
- **I2.1 Text gen (Anthropic).** On refusal, malformed JSON, or throw: the book reaches a
  terminal `failed` with the existing retryable "Try again" affordance — **never** a silent
  hang, and never a 201 that strands the reader on an infinite spinner.
- **I2.2 Illustration (fal) — the core fix.** When a Brief has **no ready Persona** (Character
  -only or persona-free) OR fal errors/rate-limits: every page still lands as a **placeholder
  -art page** and the book reaches **`draft`** (text-viewable), **never `failed`-with-zero-
  pages** once the text pass has succeeded. Placeholder art uses no raw photo and no likeness.
- **I2.3 Photo upload.** Unsupported part / network error / server 4xx-5xx → a **clear,
  retryable** error, **no partial Persona** persisted, training not left half-started.
- **I2.4 Journal.** Moments list/create failure → empty-state or inline retry, **never** a
  blank screen or a dead card; generation still succeeds with **zero** Moments (auto-context
  injection stays independently gated).

### I3 — Security / permission boundaries
- **I3.1** Placeholder art path renders **no raw uploaded photo** and trains **no likeness**
  (ADR-0020/0021 write-only photos hold). A Character-only book stays photo-free / no
  biometric data / no consent gate.
- **I3.2** Un-cut flags flip **server + mobile mirror together** (`src/lib/r1-config.ts` +
  `mobile/lib/r1-flags.ts`) — no reachable UI whose endpoint is still gated off, and no gated
  endpoint reachable without its UI. Entitlement/create-rights gates (ADR-0023/0025) stay
  server-authoritative and unchanged.
- **I3.3** Journal Moments ride the Baby's existing consent + Hard-delete/purge path
  (ADR-0007); no new consent surface, no cross-Household read (solo, one Baby).

## Scope

**In:** story-generation fix to a viewable placeholder-art draft; mobile photo-training
upload fix; Learning story type restored; Journal restored (solo, one Baby, Moment
timeline + capture); UI polish (Back button, role-correct iconography, billing toggle).

**Out (still cut):** audio / voice / narration; multi-family / invited members / collaborative
plan / multi-baby; non-US markets; Story Context Engine auto-context injection, Firsts,
Birthday/weekly suggestions (Journal renders without them); real LoRA likeness *in the core
loop* (training is fixed and wired, but the loop degrades to placeholder art without it).

## Slices (see issues 162–167)

1. **162** — Story generation → viewable placeholder-art draft (diagnose the throw; degrade
   images; a persona-free/Character-only Brief never yields `failed`-with-zero-pages). *Headline.*
2. **163** — Fix mobile photo-training upload (FormDataPart) so Persona training starts.
3. **164** — Restore Learning story type (flag + role-correct symbol + both-types test). Needs ADR-0026.
4. **165** — Restore Journal (flag + reachable UI + Moment timeline/capture, solo one-Baby). Needs ADR-0026.
5. **166** — Iconography + navigation polish (Back button, meaningful role-correct symbols).
6. **167** — Billing plan-toggle slider balance (Annual/Monthly label no longer clipped).

## Verification

Per-issue `Verification-command`s below; the whole effort is green when `npm run verify`
(the v17 verify gate) plus root + mobile typecheck plus `npx eslint mobile` pass, and the
Maestro core-loop flow (issue 155) reaches a viewable book without a trained Persona.
