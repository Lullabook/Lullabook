# Live App Audit — Reference

The exhaustive checklist hermes works through. Vocabulary follows
`CONTEXT/CONTEXT.md` (Brief, Persona, Character, Guardian, Storybook, Page,
Share link, Hard-delete). Gate line: **text is always free; illustration +
Personas are paid.**

## Flow matrix

| # | Feature | Free (:3000) | Paid (:3001) | What "PASS" means |
|---|---------|-------------|--------------|-------------------|
| 1 | Sign-up / sign-in | ✓ | ✓ | New Guardian + Family created; session persists; sign-out works |
| 2 | World / home loads | ✓ | ✓ | Roster + cold-start guidance render; no off-screen error |
| 3 | Add Character (Trait Questionnaire) | ✓ | ✓ | Character saved, appears in roster, no photos requested |
| 4 | Create text-only Story | ✓ | ✓ | Story text generated from Brief + Character; readable |
| 5 | Add family member / Persona (photos) | blocked → routed to Characters | ✓ | Consent gate shown; persona enters `training` → `ready` |
| 6 | Baby Persona consent gate | upsell/blocked | ✓ (Email-Plus VPC / consent) | No minor photo stored before consent + moderation |
| 7 | Illustrated Storybook generation | blocked / text only | ✓ | Brief → pages → 1 illustration/Page; `generating → draft` |
| 8 | Page curation (re-roll / candidates) | — | ✓ | New candidate per re-roll; pick changes Page; budget enforced |
| 9 | Finalize Storybook | — | ✓ | `draft → finalized`; becomes shareable |
| 10 | Audio / voice narration | — | ✓ | Narration generated/attached; voice panel plays |
| 11 | Share link | — | ✓ | Revocable non-indexed URL; revoke removes access |
| 12 | Export (PDF) | — | ✓ | Downloadable PDF of finalized Storybook |
| 13 | Multi-baby / household | ✓ | ✓ | Switching Family context isolates data (RLS) |
| 14 | Daily Life / Moments | ✓ | ✓ | Add moment; "Turn into a story" carries the moment |
| 15 | Firsts + Birthday offers | ✓ | ✓ | Logging a first / birthday window surfaces a Story offer |
| 16 | Account → baby birthdate | ✓ | ✓ | Saves; drives birthday offers |
| 17 | Hard-delete account | ✓ | ✓ | Erases DB **and** blob storage; data gone from every store |

iOS Simulator parity (optional, when the native app is in scope): sign-in, home
roster + RosterAvatar, characters, add-family photo path, daily moments — should
mirror web behavior for the same tier.

## Severity rubric

- **P0 / blocker** — core promise broken: can't sign up, story/illustration never
  completes, paywall leaks paid features to free, **minor photo persists before
  consent/moderation**, or hard-delete leaves data behind.
- **P1 / major** — a feature visibly fails or dead-ends (button does nothing,
  500/Inngest error, finalize/share/export broken).
- **P2 / minor** — cosmetic/UX drift, copy, off-theme styling, slow but working.

Report every P0/P1 with: tier, URL, console + network snippet, root cause,
`file:line`, and a minimal fix recommendation. P0s block release.

## Evidence to capture per failure

1. Tier + exact URL
2. Steps to reproduce (clicks/inputs)
3. Console errors + failed network request (status + response body)
4. Screenshot if visual
5. Suspected cause + file:line + minimal fix

## HITL (can't be fully automated)

Real reference-photo upload, real fal.ai LoRA training, real voice synthesis, and
true blob-storage deletion verification — flag these for a human pass with real
keys rather than reporting them as automated PASS.
