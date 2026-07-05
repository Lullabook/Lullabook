# Session Handoff — /part3 review pass #2 over mobile/

> Date: 2026-07-05. Type: `/part3` code-review chain (reuse agent → four-net audit →
> fix → fresh-eyes grade → handoff → push) over `mobile/`. Base branch:
> `fix/mobile-web-and-worklet-crashes` at `9a886c0` (its PR #108 was already merged, so
> this session's work ships on the new branch `part3/mobile-review-2`).
> Presentation-only mandate unchanged — no domain/business logic, no web code (`src/`),
> no re-added R1-cut features.

## What this session did

The user queued `/part1` + `/part2` + `/part3` with the same "review all code, find
bugs, fix them" prompt; scoped down (with the user) to `/part3` only, since that is
exactly the review-debug chain. The existing `.claude/agents/part3-lullabook.md` was
reused verbatim (idempotent — not regenerated). The maker ran the four-net audit,
seeded with follow-ups #5–#7 from the previous handoff
(`SESSION-HANDOFF-2026-07-03-part3-mobile-review.md`).

## Four-net audit results (maker)

- **(a) Failing tests: none.** Baseline `npm run verify` → VERIFY-EXIT:0.
- **(b) Static errors: none in scope.** Root+mobile `tsc` clean; `npx eslint mobile`
  app source 0 errors (only the 2 known out-of-scope `metro.config.js` `require()`
  errors; warning count unchanged).
- **(c) Invariant violations: 1 (BUG-1).** The previous handoff's follow-up #7
  predicted an Apple Sign-In *crash* on expo-web; that prediction is **refuted** —
  `expo-apple-authentication` in SDK 56 is web-safe at import time
  (`requireOptionalNativeModule` stub; `isAvailableAsync()` resolves false). The real
  bug: because `appleAvailable` is false on web, `sign-in.tsx` and `sign-up.tsx`
  rendered the fallback "Continue with Apple" Pressable — a **reachable dead button**
  whose tap throws `UnavailabilityError` into a raw error banner, violating the
  "inert means hidden or honestly disabled, never a dead tap" doctrine
  (`mobile/lib/r1-flags.ts`). All other invariants verified clean by code reading
  (render boundary, R1-cut inertness, page-turn ≤100ms, design canon, hard-delete).
- **(d) Weak/uncovered tests: 2 (BUG-2, BUG-3 = previous follow-ups #5/#6).**
  `tests/156` D2 sanctioned the JSX literal `source={source}` by variable name;
  `tests/156` D1 only scanned the inline `PageTurn` body, so a module-level
  `.springify()` const would have escaped it.

## Fixes (all 3, test-first, gates green)

1. **BUG-1** — new guard `tests/159-mobile-apple-auth-web.test.ts` (red first, 3/6
   failing pre-fix). Fix: `sign-in.tsx` fallback branch → `Platform.OS === "web" ?
   null : (…)`; `sign-up.tsx` → `Platform.OS === "ios" || Platform.OS === "web" ?
   null : (…)`. iOS shipping behavior unchanged; web preview keeps Google + dev
   email sign-in.
2. **BUG-2** — `tests/156` D2 hardened: no name allowlist; every `<Image>` source is
   extracted brace-balanced, identifier sources are resolved to their definition and
   write sites (const/let, reassignment, useState setters incl. `.then(setSource)`),
   every non-null write must derive from `avatarUrl(` / `illustrationSource(`, and
   unresolvable sources fail closed. Mutation-verified (raw
   `setSource({uri:"file://…"})` goes red; old guard passed it).
3. **BUG-3** — `tests/156` D1 hardened: whole-file balanced-paren chain scan — any
   chain rooted at `SlideIn*` or bare `FadeIn` must be springify-free and `SlideIn*`
   durations ≤100ms (Card's legit `FadeInUp` spring excluded by word boundary).
   Mutation-verified (module-level `SlideInRight.duration(90).springify()` goes red).

## Fresh-eyes checker grade (maker ≠ checker): **PASS**

A separate blind checker (diff + invariant docs only) graded the diff. **No defects.**
It independently re-ran all four mutation probes (M1 springify inline, M2 module-level
multiline springify chain, M3 raw-photo write site, M4 web gate removed) plus an
aliased-var probe — every one went red as designed. It verified the Platform ternaries
character-by-character (iOS path byte-identical; the sign-in/sign-up fallback asymmetry
predates this diff; Android's error-on-tap fallback is pre-existing and Android is not
an R1 surface). Checker process note: one mutation revert briefly used
`git checkout --` on `sign-in.tsx`; the diff was restored byte-for-byte and verified
via `git patch-id`.

The checker demonstrated **three D2 bypass classes and two low-severity edges — all
explicitly optional hardenings, not defects** (the app satisfies the invariant today;
the guard is strictly stronger than its predecessor). Now follow-ups #5–#9 below.

## Gates at handoff

- `npm run verify` → **PASS, VERIFY-EXIT:0** — full suite **558 tests green**
  (incl. new 159 and hardened 156). One intermediate maker run tripped verify.mjs's
  120s vitest timeout under CPU contention with a parallel eslint; standalone vitest
  was 558/558 and the clean re-run passed in ~27s.
- `npx eslint mobile` → app source **0 errors** (2 pre-existing `metro.config.js`
  `require()` errors, out of scope).
- Diff touches only: `mobile/app/sign-in.tsx`, `mobile/app/sign-up.tsx`,
  `tests/156-mobile-render-invariants.test.ts`, `tests/159-mobile-apple-auth-web.test.ts`
  (new). Root `next-env.d.ts` / `tsconfig.json` churn left uncommitted (generated).

## Phone testing (set up this session)

`mobile/.env` (gitignored) now points `EXPO_PUBLIC_API_URL` at the laptop's LAN IP
`http://172.20.10.2:3001` (iPhone-hotspot subnet) so a physical iPhone running Expo Go
can reach the local backend. Recipe: `npm run dev:paid` at root, `npm run start` in
`mobile/` (default host — never `--host localhost`, it binds IPv6-only), scan the QR
with the iPhone Camera. If the network changes, rerun `ipconfig getifaddr en0` and
update `.env`, then restart Expo (EXPO_PUBLIC_* bakes in at bundle time).

## Known follow-ups (flagged, not built)

1. **Mobile PDF-export affordance** missing — completes the R1 "keeps it as a PDF"
   promise; server route exists. **Next agent starts here (`/part2`).**
2. **Paywall CTA doesn't purchase** — RevenueCat IAP unwired. Inert, not broken.
3. **Repo-root lint debt + `tests/* 2.*` macOS dupes** — needs a dedicated issue.
4. **Candidate "🎨 Look N" chips** — placeholders, no real thumbnails.
5. **(new, checker) 156 D2 misses non-`<Image>` render surfaces** — `<ImageBackground`
   and `Image as Img` aliases slip the `/<Image\b/` site scan; broaden to
   `/<(Image\w*|\w*Image)\b/` or scan `source=` on any JSX tag.
6. **(new, checker) 156 D2 sanctions write lines by substring** — a ternary mixing
   `avatarUrl(…)` with a raw URI on one line passes; assert the whole expression, not
   substring presence.
7. **(new, checker) 156 D2 skips `<Image>` with no literal `source=`** — spread props
   (`<Image {...p} />`) get zero assertions, and the unbounded `indexOf("source=")`
   can grab a later element's attribute; require a literal `source=` within the tag.
8. **(new, checker) 156 D1 edges** — `.springify ()` with a space escapes the
   `includes` check; `const cfg = SlideInRight; cfg.duration(…).springify()` escapes
   the module-level builders regex. Contrived; Prettier makes both unlikely.
9. **Billing copy claim unverified** — billing.tsx says "Founding families get the
   first month free after the trial"; no entitlement backing in code. **User must
   confirm the offer is real or cut the line** (honesty invariant).

## Suggested next session

- **`/part2`** for follow-up #1 (mobile PDF export/finalize) — lowest-numbered real
  feature gap, completes the R1 keepsake flow.
- Manual end-to-end sweep on the physical iPhone now that Expo Go is wired: upload →
  persona → generate (real fal path) → read → delete; measure cold start against the
  <3s budget on hardware.

## Reference

- Prior handoff: `CONTEXT/handoffs/SESSION-HANDOFF-2026-07-03-part3-mobile-review.md`
- Audit log (session scratchpad): `part3-audit-log.md`
- Reviewer agent (reused, unchanged): `.claude/agents/part3-lullabook.md`
