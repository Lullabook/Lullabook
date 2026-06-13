# 54 — Auto-context personalization layer (ADR-0019)

Triage: ready-for-agent

## What to build
The heart of the feature: make every Story for a Baby silently more personal by
feeding recent Moments into the Prompt. Implements ADR-0019.

- In the **Prompt builder**, pull the Baby's **auto-context set** and inject it as
  background context, **distinct from the parent-authored Brief**. Contract:
  > every **Significant Moment** for the Baby + every ordinary Moment logged
  > **since that Baby's last Story**.
- Per-Baby **watermark**: record which Moments a generation pass consumed so the
  "since last Story" window advances. Only a generation that **reaches Story text**
  consumes Moments (a failed pass does not advance the watermark).
- **Bounding:** a hard newest-N ceiling + a token budget so a prolific logger can't
  bloat the Prompt; significant Moments take priority when trimming.
- No change to Brief shape, Scenes, Style Bible, or the durable spine — Moments are
  one more Prompt input.

## Acceptance criteria
- Generating a Story for a Baby with Moments injects the correct auto-context set
  (significant always; ordinary only since the last Story) into the Prompt.
- After a successful generation, the watermark advances so previously-consumed
  ordinary Moments are excluded next time; significant Moments still always appear.
- A failed generation does not advance the watermark.
- The context set respects the newest-N / token cap, dropping ordinary before
  significant Moments.
- Tests (test-first) cover the contract: significant-always, since-last-Story
  window, watermark advance-on-success / hold-on-failure, and the cap.

## Blocked by
50 (Moment capture + Journal timeline)
