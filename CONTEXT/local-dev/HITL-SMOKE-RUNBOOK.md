# Lullabook — HITL Full-App Smoke Runbook

> **Human-in-the-loop manual test.** Claude writes the steps; a human with real keys
> executes them on the local iOS Simulator. This is the consolidated runbook for PRD v10
> (`CONTEXT/planning/prd-v10-hitl-smoke-verification.md`). **Foundation section (this
> issue, 82) is complete; per-area sections are filled in by issues 83–87.**
>
> **No secrets in this file — environment-variable *names* only.**

## How to use this runbook

1. Do **§0 Foundation** once to get a running backend + Simulator + a dedicated test Family.
2. Work through each area section (§1–§5) in order — they depend on the foundation and on
   each other (auth → roster → journal/storybook).
3. For **every step**, record a row in that section's results table: `PASS` / `FAIL` /
   `DEFERRED`, the observed value (e.g. actual generation time), and the date.
4. On any **FAIL**, stop and file a defect issue (see **§Defect path**) before continuing
   past dependent steps. Closed feature issues stay closed; failures become new `bug` issues.
5. Measure every timed step against the **Invariants (PASS/FAIL contract)** below — that
   is the bar, not "felt fine."

## Prerequisite & caveats (read first)

- **Apple Developer membership is NOT required** for this local smoke. It's only needed for
  the TestFlight/device path (issue 63).
- **Apple Sign-In caveat:** a bare Simulator often has no Apple ID. If you cannot sign into
  an Apple ID in Simulator **Settings**, mark the Apple step `DEFERRED` (to a real device /
  TestFlight, issue 63) — **do not FAIL the wave for it.** Everything else runs locally.
- **Test data only:** use the dedicated test Family from §0.4 with dev/sample photos.
  **Never** put a real child's photo or a production user through this runbook.

---

## §0 Foundation (issue 82)

### §0.1 Environment bring-up

Backend + mobile both pointed at the **paid** dev tier (port 3001, subscription gate
force-unlocked). The base local setup (Supabase project, schema, email-confirm off,
`.localblob` fallback) is in **`CONTEXT/local-dev/RUN-LOCAL.md`** — do that first; it is not
repeated here.

```bash
# Terminal A — backend (repo root): paid tier on :3001
npm run dev:paid          # DEV_FORCE_SUBSCRIPTION=active, http://localhost:3001

# Terminal B — Metro IPv4 proxy (if the Simulator can't reach Metro)
cd mobile && npm run proxy:8081

# Terminal C — mobile app against the paid backend, booting the Simulator
cd mobile && npm run ios:paid
#   sets EXPO_PUBLIC_API_URL=http://127.0.0.1:3001
#   and the __DEV__ dev-login creds (EXPO_PUBLIC_DEV_EMAIL / EXPO_PUBLIC_DEV_PASSWORD)
```

- The `npm run ios:paid` dev-login is the **fast way in** for non-auth areas (§3–§5). The
  **real** Apple/Google auth is verified separately in **§1 (issue 83)**.
- Confirm the app loads and `/api/home` returns data (not 401) before proceeding.

**§0.1 checks**

| Step | Expectation | Result | Observed | Date |
|------|-------------|--------|----------|------|
| Backend up on :3001 | `dev:paid` serving; `DEV_FORCE_SUBSCRIPTION=active` |  |  |  |
| Simulator boots app | Expo build loads in iOS Simulator |  |  |  |
| Home loads | `/api/home` returns data; screen settles in **under ~1s** on a normal tap (no multi-second spinner) |  |  |  |

### §0.2 Env / secrets checklist (names only — never paste values)

The full local floor is in `RUN-LOCAL.md` + `.env.example`. For a **full** smoke (real
storybook generation, photo safety scan), the real-path vars are:

- **Supabase (hard floor):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- **Story text:** `ANTHROPIC_API_KEY`
- **Illustrated Storybook:** `FAL_API_KEY`, `FAL_WEBHOOK_URL`, `INNGEST_EVENT_KEY`,
  `INNGEST_SIGNING_KEY`, and a blob store (`BLOB_S3_ENDPOINT`, `BLOB_S3_BUCKET`,
  `BLOB_S3_REGION`, `BLOB_S3_ACCESS_KEY_ID`, `BLOB_S3_SECRET_ACCESS_KEY`) — or omit blob
  keys to use the `.localblob/` fallback (issue 57)
- **Photo safety scan:** `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REKOGNITION_REGION`,
  `CSAM_HASH_API_URL`, `CSAM_HASH_API_KEY`
- **App URL (OAuth redirect base):** `NEXT_PUBLIC_APP_URL`

> Any var not set just makes the specific action that needs it fail (lazy reads). Note
> which keys you have when recording results — a `DEFERRED` due to a missing key is not a `FAIL`.

### §0.3 OAuth provider prerequisites (for §1)

Before the auth section can PASS, in the **Supabase dashboard → Authentication → Providers**:

- **Google** enabled, with the OAuth client + the app's redirect URL (the
  `com.lullabook` scheme / `NEXT_PUBLIC_APP_URL` callback) registered.
- **Apple** enabled (for the device/TestFlight Apple path).
- Email confirmation can stay OFF for local (per `RUN-LOCAL.md` §3).

### §0.4 Dedicated test Family setup

- Create a **throwaway** account (e.g. via `npm run ios:paid` dev-login, or a fresh
  Apple/Google sign-in in §1) — **not** a personal/production account.
- Add **one Baby** and roster members using **dev/sample photos only** (no real children).
- This Family is the subject of every section. In **§1 (issue 83)** its hard-delete is the
  teardown — wiping it doubles as the hard-delete propagation check.

**§0 acceptance (issue 82):** this runbook exists with bring-up, env checklist, OAuth
prerequisites, test-Family setup, the invariants contract, the global results table, and
the defect path — and a human can reach a running Simulator + backend + test Family from it.

---

## Invariants — the PASS/FAIL contract

Every step is measured against these (full rationale in PRD v10). A deviation is a **FAIL**.

### Latency budgets
- Storybook generation `generating → draft`: **≤ 5 min**
- Reader page image load: **≤ 30s** per page
- Home/API responses: **p95 < 1s** (engineering target). *Human proxy:* a normal tap
  settles in **under ~1s**; flag anything with a visible multi-second spinner.
- Moment capture → top of timeline: **< 2s**

### Failure modes (expected behavior)
- Backend down / 5xx → in-screen kit error (`C.danger`); **no crash, no unhandled rejection**
- Generation failure → `failed`, **re-rollable**, not a dead end
- Failed reader Page → **recoverable hole**, not an error screen
- Missing/expired token → routed to sign-in (no white screen / infinite spinner)
- Offline → graceful, retryable error

### Security / permission boundaries
- Protected Bearer endpoint, no/invalid token → **401**; no data without auth
- Reader shows **generated illustrations only** — never a raw uploaded photo (ADR-0020)
- `DEV_FORCE_SUBSCRIPTION` is **dev-only** — must never ship enabled
- **Hard-delete propagates** across DB **and** blob storage
- Per-Family isolation (RLS): test account sees only its own data (single-account smoke is
  a *limited* check — true cross-Family isolation needs a 2nd account; flagged in §5)

---

## Global results summary

| Area | Issue | Status | Notes |
|------|-------|--------|-------|
| §0 Foundation | 82 | ☐ |  |
| §1 Auth & account | 83 | ☐ |  |
| §2 Family & roster | 84 | ☐ |  |
| §3 Journal / Firsts / Moments | 85 | ☐ |  |
| §4 Storybook generate & reader | 86 | ☐ |  |
| §5 Failure & boundary sweep | 87 | ☐ |  |

---

## Defect path (when a step FAILs)

File a new issue — **do not reopen** the closed feature issue.

```bash
gh issue create \
  --title "bug: <area> — <one-line symptom>" \
  --label "bug" --label "ready-for-agent" \
  --body-file <repro.md>
```

Repro template (`<repro.md>`):

```md
## Where
Runbook §<n.n> (<area>), issue <NN>

## Steps to reproduce
1. …

## Expected (invariant)
<the budget/failure-mode/boundary it should meet>

## Actual
<what happened — include observed timing for latency FAILs>

## Env
dev:paid @ :3001, Simulator <iOS ver>, keys present: <list by NAME>
```

---

## Verification (machine-checkable done-condition)

This runbook has an automated guard so it can't rot into a "confidently wrong" doc as
issues 83–87 extend it:

```bash
npm run check:runbook      # node scripts/check-hitl-runbook.mjs — exits 0 iff clean
```

It fails the build if the runbook drops a required section, cites an `npm run` script /
repo file / `ADR-NNNN` that doesn't exist, or pastes a literal secret value. **Run it
after editing any section** (it is the issue-82 done-condition and the guard for every
later slice).

## §1 Auth & account — *filled in by issue 83*
_Scaffold: Google sign-in, Apple sign-in (device caveat), session restore, hard-delete teardown._

| Step | Expectation | Result | Observed | Date |
|------|-------------|--------|----------|------|
| _to be completed in issue 83_ |  |  |  |  |

## §2 Family & roster — *filled in by issue 84*
_Scaffold: create member/persona, photo upload (70), training→ready, avatar, edit Character (80)._

| Step | Expectation | Result | Observed | Date |
|------|-------------|--------|----------|------|
| _to be completed in issue 84_ |  |  |  |  |

## §3 Journal / Firsts / Moments — *filled in by issue 85*
_Scaffold: Moment capture+timeline (75), Firsts filter + "Make this a Story" (76), moment photo, birthday offer._

| Step | Expectation | Result | Observed | Date |
|------|-------------|--------|----------|------|
| _to be completed in issue 85_ |  |  |  |  |

## §4 Storybook generate & reader — *filled in by issue 86*
_Scaffold: Brief→generate (78), paged reader (79), re-roll, failed-page hole, lullaby (73)._

| Step | Expectation | Result | Observed | Date |
|------|-------------|--------|----------|------|
| _to be completed in issue 86_ |  |  |  |  |

## §5 Failure & boundary sweep — *filled in by issue 87*
_Scaffold: 5xx/offline, 401/token expiry, dev-gate-off, single-account isolation note._

| Step | Expectation | Result | Observed | Date |
|------|-------------|--------|----------|------|
| _to be completed in issue 87_ |  |  |  |  |
