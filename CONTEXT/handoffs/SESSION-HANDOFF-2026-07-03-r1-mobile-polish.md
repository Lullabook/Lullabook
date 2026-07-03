# Session Handoff — R1 mobile polish (launch-readiness sweep)

> Date: 2026-07-03. Type: maker→checker polish loop (/loop-engineer + /part3 spirit) over the
> whole Expo app in `mobile/`. Branch: `feat/prd-v15-v16-v17-136-155`, polish commit `be2f907`
> on top of the completed 136–155 wave. Presentation-only by mandate — no domain/business
> logic, no web code, no new surfaces.

## What this session did

A full-app audit of every mobile screen/component against the Maya's World canon
(`.claude/skills/lullabook-design*`) and the R1 invariants
(`planning/r1-release-scope-and-invariants.md`, PRD v15/v16), then one fix wave, graded by a
fresh-eyes checker sub-agent (maker ≠ checker). Consolidated findings live in the session
scratchpad (`findings.md`); the load-bearing ones:

### Honesty / cut-alignment fixes (would have shipped wrong claims)
- **Settings hardcoded fake billing** — "$12 / month · renews Jul 7, 2026" was fabricated.
  Now honest, no invented numbers (server entitlement stays the only billing truth).
- **"Free tier"/"Free plan" copy** on Home + Settings — R1 has *no* free tier (trial-entry,
  ADR-0025). Reworded to plan-active / trial-available.
- **Privacy copy advertised Share links** (cut to R2) — now "Storybooks stay private".
- **Create offered 4 story types** — R1 locked *Bedtime only*. Gated behind
  `EXPO_PUBLIC_R1_STORY_TYPES_ENABLED` (unset = cut, same idiom as r1-flags).
- **Paywall marketed cut features** — "8 stories/mo" (caps not surfaced in R1) and
  "2 logins" (multi-family cut) removed; login row returns via `isR1MultiFamilyEnabled()`.
- **Dead Delete-character button** that only apologized ("backend follow-up") — removed
  (inert-not-broken).
- **Mic permission prompt for a cut feature** — `family/[id]` requested microphone on mount
  while audio is cut. Now gated on `isR1AudioEnabled()` (App Review + trust).
- **Fabricated data**: Home's "N stories this week" was `personas.length`; Daily's "Their
  usual day" was a hardcoded fictional schedule. Both removed/reworded.

### Latency invariants
- **Page-turn was ~400ms, not <100ms**: `SlideInRight.duration(280).springify()` — springify
  *ignores* `.duration()`. Now a 90ms timing slide (reduce-motion: 90ms crossfade).
- **Cold start**: SpaceMono + an unused Nunito weight no longer block splash-hide; Expo
  template components (Themed/EditScreenInfo/StyledText/ExternalLink/useClientOnlyValue/
  Colors.ts) deleted.

### Brand / craft
- **Dark mode no longer yields stock RN DarkTheme** (pure black + system blue): branded
  light nav theme forced, `userInterfaceStyle: "light"` (canon: no dark surface but the
  voice panel).
- **`family/[id]` was an unregistered route** (default system header) — registered with the
  Maya stack header; screen now shows a persona card (avatar + warm training status) instead
  of leading with a cut voice-recording pitch.
- **BrandGradient** (same runtime-fallback pattern as issue 137): 3-stop hero gradient
  (canon §1.3) on Home hero / Settings profile / family-new preview; bookSky gradient
  covers in the library; all **5** canonical avatar gradients (teal was missing) rendered
  as real gradients in RosterAvatar.
- Every hand-rolled CTA now goes through PrimaryButton/GhostButton or the shared
  press-feedback hook — gradient+glow+haptics, 44pt, accessibilityRole; bare
  ActivityIndicator loads replaced with layout-mirroring skeletons; raw status enums
  (`training`, `bedtime · draft`) replaced with warm labels; sign-in/up got the Lullabook
  wordmark, a sign-up cross-link, and prod-safe error copy (Supabase jargon __DEV__-gated).
- **13 untracked macOS " 2." dupe files under `mobile/`** (they shadow expo-router routes →
  Unmatched Route; see the standing memory) deleted again.

### Test infra
- `tests/154-verify-gate.test.ts` was order/load-flaky: nested `vitest run` subprocesses
  inherited `R1_*` flags other test files set on the worker env, and 5s default test
  timeout vs a ~3s+ subprocess under load. Now hermetic (sanitized env) with real timeouts.

## Gates at handoff
- `npm run verify` → **PASS, exit 0** (root+mobile typecheck, 541 vitest tests, Sentry check,
  149 sweep, 153 seed; Playwright skipped — no dev server).
- `npx eslint mobile` → 0 errors in app source (2 pre-existing errors remain in
  `mobile/metro.config.js` — `require()` style, normal for Metro; untouched).
- Fresh-eyes checker grade (maker ≠ checker): **first pass FAIL → fixed → clean.** The
  checker caught a real maker error: the "Funny" moment tag's `#FCE4EC`/`#B5618A` had been
  "corrected" to danger tokens, but that pair **is** the canonical rose tag family
  (design REFERENCE, small-tag color families) — the maker's audit mis-classified it.
  Restored. Two minors also fixed: a component defined mid-import-block in Settings, and
  the paywall's narration feature row now double-gated behind `isR1AudioEnabled()`.
  Everything else it verified clean: hex canon across all touched files, no raw-photo
  renders, page-turn under budget, 149 test guards intact, no new deps, no domain changes.

## Known follow-ups (out of polish scope, flagged not built)
1. **PDF export + finalize have no mobile affordance** — the server route
   (`src/app/api/storybooks/[id]/export`) and test 132 exist, but the reader offers no
   finalize/export. The R1 keepsake step needs its own issue (needs expo-file-system/
   sharing wiring).
2. **Paywall CTA doesn't purchase** — "Start your 7-day free trial" still just dismisses;
   RevenueCat IAP wiring is its own issue (R1 locked decision, unimplemented on mobile).
3. **Repo-root lint is red** (~1000 pre-existing errors: `tests/* 2.*` macOS dupes at the
   repo root — not deleted, blanket deletion was declined by policy — plus old `any`s in
   tests). Worth a dedicated dupe-sweep + lint-debt issue.
4. Candidate picker shows numbered "🎨 Look N" chips — real thumbnails need the candidate
   wire format to expose an image key (`content` field shape unverified).

## Next agent starts at
Follow-up 1 (mobile PDF export) — it completes the R1 promise ("keeps it as a PDF").
