# PRD v7 — Roster Avatars, Local-Dev Ergonomics & TestFlight Readiness

Status: **planning** (grilled 2026-06-14). Builds on PRD v5 "Maya's World" and PRD
v6 "Journal & Moments." Monetization/paywall gating stays **deferred** (tier-agnostic),
consistent with v5/v6.

Domain language: `CONTEXT/CONTEXT.md` ("Roster avatar" section).
Key decision: `CONTEXT/docs/adr/0020-roster-avatar-generated-not-raw-photo.md`.
UI polish backlog: `CONTEXT/planning/web-and-app-feedback.md`.

> This PRD bundles three threads that surfaced together in a real local run:
> a **privacy/display** change (roster avatars), the **local-dev ergonomics** that
> unblock testing it (the blob fix, two-mode dev, UI polish), and the **operational
> path to TestFlight**. They ship as independent vertical slices (issues 57–63);
> nothing here re-does visual design — it builds against the existing v2 system.

## 1. Vision

Two things were true after running the app locally: (a) adding a family member
**crashed** with `Missing required environment variable BLOB_S3_ACCESS_KEY_ID`, and
(b) the app showed the **raw uploaded selfie** as each person's picture. This PRD
fixes the crash, replaces raw photos with clean **AI-generated avatars** rendered
from each person's likeness model (so the interface never shows a real face — the
minor benefits most — while stories still look like the real family), makes it easy
to compare the free vs subscribed experience locally, clears two UI polish items,
and lays down the human-in-the-loop runbook to get the iOS app onto **TestFlight**.

## 2. The model (what's new)

| Term | Meaning |
|---|---|
| **Roster avatar** | The picture shown for any roster member (Baby or adult) everywhere in the app. A clean illustration **generated from that member's trained likeness LoRA**, never their raw uploaded photo. Raw photos are still stored and still train likeness (Story + video); they are simply never rendered on a display surface. Members can update their reference photos → retrain → regenerate the avatar. Placeholder while `training`/`failed`. (ADR-0020) |

This is a **display/privacy layer** only. It does **not** change ADR-0001
(photo-conditioned likeness) or ADR-0002 (per-persona LoRA): photos are still
uploaded, still stored in the blob store, still train the model that makes stories
resemble the real person.

## 3. Locked decisions

1. **Avatar is display-only.** Photos still uploaded; LoRA still trains; stories/video
   still resemble the real person. ADR-0001/0002 untouched.
2. **Avatar is generated from the person's LoRA** once training reaches `ready`; a
   neutral placeholder stands in while `training`/`failed`.
3. **Raw photos are never rendered on any display surface** (roster cards, story
   credits, member pickers) — web **and** mobile — for **Baby and adults alike**.
   (ADR-0020)
4. **Photos stay editable:** a member can update/replace reference photos, which
   re-runs training and regenerates the avatar; photos are swapped, never displayed.
5. **BLOB bug fix:** when `BLOB_S3_*` creds are absent and `NODE_ENV !== production`,
   wire a **local disk-backed blob store** instead of `R2BlobStore` (mirrors the
   existing moderation dev-fallback in `src/lib/context.ts`). Production still
   requires real R2. Adding a family member then works locally with zero secrets.
6. **TestFlight = one HITL runbook** (issue 63): enroll in Apple Developer → fill real
   `eas.json`/`app.json` ids + bundle identifier → deploy the backend (Vercel) →
   `eas build --platform ios` → `eas submit` to TestFlight. Claude writes the runbook;
   the human executes it once enrolled.
7. **Two-mode local dev:** `dev:free` (port 3000) and `dev:paid` (port 3001), each
   forcing the Family's Subscription state, so the gated vs ungated experience can be
   compared side by side.
8. **Web polish** (from the feedback log): Create-page font consistency; World
   "What happened today?" nudge contrast.

## 4. Surfaces

1. **Add / Edit family member** — on training-complete, generate + store the Roster
   avatar; show a placeholder while training. Add an "update reference photos" action
   that re-enters training and regenerates the avatar. No raw-photo `<img>` anywhere.
2. **Everywhere a member's picture appears** — World, Family roster, story credits,
   member pickers, mobile family screens — render the Roster avatar (or placeholder),
   never the raw photo.
3. **Local dev** — two npm scripts run two servers seeded to opposite Subscription
   states; a dev seed provides one `active` and one `inactive` Family.
4. **Create page + World nudge** — the two polish fixes.
5. **iOS app** — `eas.json`/`app.json` carry real ids + a real bundle identifier; the
   app points at the deployed backend; an `INTEGRATION-FOR-OPUS.md`-style runbook walks
   the human through enrollment → build → TestFlight submit.

## 5. The avatar-generation seam

`PersonaService.create` (`src/services/persona.ts`) already uploads photos to the
blob store and starts fal training; `trainWithRetry`'s `ready` branch flips status
and notifies. **Extend that `ready` branch** to render one clean portrait through the
existing image pipeline using the new LoRA, store it under the Family-scoped key
space (so hard-delete/purge erases it — ADR-0007), and persist an `avatarKey` on the
member. `getLikenessSamples` currently returns a stubbed `example.com` URL — the real
avatar render replaces that stub. A nullable `avatarKey` ⇒ render the placeholder.

## 6. Out of scope / deferred

- No change to likeness training, LoRA, or biometric consent (ADR-0001/0002/0008 hold).
- No paywall/monetization decisions (still deferred); the two-mode dev only **exercises**
  the existing `active`/`inactive` gate, it does not design pricing.
- Photo/mood-rich Moments, Reader provenance, and other PRD v6 follow-ups are unaffected.
- The actual Apple enrollment, backend deploy, and TestFlight submit are **executed by
  the human** via the issue-63 runbook — this PRD plans them, it does not perform them.

## 7. Slice order (issues)

`57` BLOB dev fallback (unblocks add-member locally) → `58` Roster avatar, web
(generate-from-LoRA + render everywhere + no raw photo) → `59` update/replace
reference photos → `60` two-mode local dev → `61` web polish (Create font + nudge
contrast) → `62` mobile roster-avatar parity → `63` HITL TestFlight runbook.

57 is pure infra and unblocks everything that stores a photo/avatar; 58 implements
ADR-0020 on web and is the spine; 62 ports it to mobile so the TestFlight build (63)
ships the avatar rule. 60 and 61 are independent and can land anytime.
