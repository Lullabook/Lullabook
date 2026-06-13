# Session handoff — 2026-06-13 (session wrap)

Wraps the live coding session that produced the "Maya's World" build. The
detailed build notes already live in
`CONTEXT/handoffs/SESSION-HANDOFF-2026-06-13-maya-world-part2.md` (and
`HANDOFF.md` points there) — **this doc adds the session-level arc and the open
PR/auth state**, so it does not repeat the build details.

## State at handoff

- **Branch:** `feat/maya-world-issues-34-44`, clean, in sync with origin.
- **Commits this session (ahead of `main`):**
  - `288a49c` — character auto-description + Maya's World seed + v2 Create/Stories UI (issues 46–48)
  - `e915d10` — add web-design & app-design research subagents (`.cursor/agents/`)
  - (earlier in session) `05f28e8` — the 4 macOS `* 2.*` duplicate files (committed at user request)
- **Tests:** `npx vitest run` → **168 passing**; `npx next build` passes.
- **PR:** NOT yet open — `gh` is unauthenticated. Ready-to-send body at
  `.git/PR_BODY_maya_world.md`. Compare URL:
  `https://github.com/VrajGupta/Lullabook/compare/main...feat/maya-world-issues-34-44?expand=1`
  After `gh auth login`:
  `gh pr create --base main --head feat/maya-world-issues-34-44 --title "Maya's World: character auto-descriptions, seed data, v2 Create/Stories UI" --body-file ".git/PR_BODY_maya_world.md"`

## What happened this session (arc)

1. **Persona photo upload 413 fix** — `next.config.ts` `serverActions.bodySizeLimit: "25mb"` (default 1 MB rejected real photos). Live on dev.
2. **Two design-research subagents** created (`.cursor/agents/web-design-researcher.md`, `app-design-researcher.md`) and run read-only to produce a visual-fidelity spec + a UX/IA + seed + char-description spec against `~/Downloads/Lullabook/Lullabook Redesign v2.dc.html` (the visual source of truth; the `screenshots/` folder was effectively unavailable to the researchers).
3. **`/part2` build** (test-first) shipped issues 46 (char auto-description), 47 (Maya's World seed), 48 (Stories status-aware routing) plus the v2 Create composer, Stories shelf, `/characters/[id]/edit`, token/visual work, and `design/lullabook-current-design.html`.

## How to view locally

- `npm run dev` (Next 15, port 3000). Sign in.
- Seed demo data: `DEV_DEMO_SEED=true NODE_ENV=development` → "🌱 Load example
  data (dev)" button on `/world`, or
  `DEV_DEMO_SEED=true npx tsx tools/seed-demo.ts <authUserId>`.

## Honest follow-ups (carried)

- **v2 two-pane Reader rebuild** — biggest remaining design-parity gap; suggested **next issue 49**.
- Dev seed writes **display-only** rows (personas `ready` w/ placeholder LoRA; storybooks without generated Pages) → seeded books' Reader/curation are empty.
- Duplicate v2 CSS blocks in `globals.css` left unmerged (regression risk).
- Legacy-styled routes deferred: `/account`, `/billing`, `/personas`, `/stories/new`, `/storybooks/[id]`, classics; voice UI still a placeholder.
- Composer doesn't yet honor `?starring=` / `?characters=` preselect (Cast-in-a-story / Write-a-story deep links).
- The earlier `* 2.*` macOS duplicate files were committed (`05f28e8`) and rode into the branch — consider removing.

## Suggested skills for next session

- `/part2` — pick up **issue 49 (v2 two-pane Reader)** next (lowest-numbered unblocked, highest parity value).
- `/push-handoff` — once `gh auth login` is done, open the PR (one command above).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
