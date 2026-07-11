# SESSION HANDOFF — 2026-07-09 — Post-R1 wayfinder map charted

## Scope
User invoked `/part1` to (a) lay out the whole **post-R1 territory** as a map and
(b) run the updated dev server to see Fable's 168–174 monetization changes. Per
`/part1` step-0 sizing gate, (a) was a **mountain** (spans many subsystems, open
questions not yet nameable) → routed to `/wayfinder` in **chart mode**. No
application code was written this session — planning + charting only.

## Primary artifacts (do not restate — read these)
- **The map:** GitHub issue **#133** `[wayfinder] Post-R1 map — the road after launch`
  (label `wayfinder:map`). Body = Notes / Decisions-so-far (empty; nothing resolved
  yet) / Fog. `gh issue view 133`.
- **Tickets:** #134–#146 (label `wayfinder:postr1` + one `wayfinder:<type>` label).
- **Conventions:** `docs/agents/issue-tracker.md` → "Wayfinding operations" (frontier
  query, blocking-via-body-line, resolution flow). **Appended this session — the only
  uncommitted repo change.**
- **Memory pointer:** `lullabook-postr1-wayfinder-map.md` (map id, scope calls, how to advance).

## Locked scope calls (user decisions this session)
1. Map **includes the release milestone** — real RevenueCat IAP, EAS dev build,
   App Store submission, prod fal.ai illustration + LoRA fix — as the **first frontier**
   (the release is the near edge, not out of scope).
2. **North star = premium feature depth** — Voice/lullaby + Video pages → the $25
   "Our Whole Family" tier (ADR-0025). This is what the map ultimately drives toward.
3. **Full R2 backlog** — chart all major buckets now, not just the release slice.

## Map structure (DAG)
- **Frontier (open, unblocked):** #134 real RevenueCat IAP · #135 EAS build pipeline ·
  #136 fix prod illustration/LoRA · #138 cost/margin model · #144 retention-loop scope ·
  #145 Asia jurisdiction · #146 web + share links.
- **Blocked chain:** #137 App Store submission ← 134/135/136 · #139 pricing/2-plan ←
  138 · #140 Voice ← 139 · #141 Video ← 139 · #142 family accounts ← 139 · #143 wire
  premium gates ← 140/141/142.
- **Fog (sketched in #133, not ticketed):** Personalized Classics · Custom art style ·
  multi-baby · roster avatars · Android · RevenueCat webhook hardening ·
  growth/analytics · LoRA-quality-at-scale.

## Run-the-dev-server outcome (intent b)
- **Backend works:** `npm run dev:paid` serves on **:3001** (verified HTTP 200). See
  `CONTEXT/local-dev/RUN-LOCAL.md`. `DEV_FORCE_SUBSCRIPTION` is dev-only (prod-guarded).
- **Mobile BLOCKED — environment, not code:** this machine has **no Xcode.app** (only
  Command Line Tools; `xcode-select -p` → `/Library/Developer/CommandLineTools`;
  `simctl`/`xcodebuild` fail → simulator can't boot). User is installing Xcode.
- **Unblock recipe (next session):** install Xcode → open once (accept license) →
  `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` → install an iOS
  Simulator runtime → `npm run ios:paid` (already wired to :3001 + simulator creds).
  Then review the 168–174 first-open **demo → trial → consent → paywall** flow live.

## Deferred to next session
- **168–174 simulator/runtime review** — needs Xcode (above). This is the "xcode review"
  the user chose to skip for now.
- **NOT re-running `/part3`** — 168–174 is already audited + green (126 files / 736 tests,
  commit `e185ea1`; see `SESSION-HANDOFF-2026-07-09-part3-168-174-audit-graded-fixes.md`).
  Nothing new to audit — this session added no app code.

## State
- Branch: `feat/prd-v20-pillar-a-payment`
- Uncommitted: `docs/agents/issue-tracker.md` (wayfinding-ops section) — will be committed
  by this handoff's `push-handoff` step.
- No app-code changes this session; test/typecheck state unchanged from `e185ea1`.

## Next steps (for a fresh agent)
1. **To burn down the map:** re-invoke `/wayfinder` with map **#133**. Resolve **ONE**
   frontier ticket per session; set `wayfinder:claimed` **first**. Recommended first:
   **#136 (fix prod illustration/LoRA)** — biggest known risk and gates #137 App Store.
2. **When Xcode is ready:** run the deferred 168–174 live review via `npm run ios:paid`
   (relaunch `npm run dev:paid` alongside it).
3. A resolved chunk that has become grillable re-enters `/part1`.

## Suggested skills
- **`/wayfinder`** (with `#133`) — the mechanism to advance the map, one ticket/session.
- **`/part1`** — once a resolved chunk is grillable (nameable open questions, fits one pass).
- **`/part3`** — only after new mobile app code lands; not needed for this planning session.
