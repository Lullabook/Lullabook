# PRD — Lullabook v1 (Text + Illustration Storybook)

> Status: ready-for-agent · Date: 2026-06-09
> Vocabulary follows [CONTEXT.md](../CONTEXT.md). Decisions follow ADRs 0001–0015
> in [docs/adr/](../docs/adr/).
>
> ⚠️ Compliance items (COPPA/PDPA/DPDP/GDPR, CSAM/NCMEC) are engineering design
> intent and require per-market legal sign-off before launching that market.

## Problem Statement

Parents want stories that star *their own* baby and family — not a generic
infant. Existing personalized books use stock characters or shallow name
substitution; none make the child genuinely *appear* in the illustrations across
a coherent book. Parents have no easy, safe way to turn "I wish there were a
bedtime story about my Lily learning to share" into a real, illustrated keepsake
featuring their actual child and family.

## Solution

Lullabook is a web app where a Guardian sets up reusable Personas (anchored on
uploaded photos, realized as per-persona LoRAs) for their baby and family, then
generates illustrated Storybooks starring those Personas. The parent gives a
light **Brief** (starring Personas + curated theme/setting + optional note); the
system generates Story text and a coherent set of illustrated Pages held together
by a per-book Style Bible. The parent curates the draft (re-rolling individual
Pages), finalizes it, and shares it privately or exports a PDF keepsake. The whole
flow is built around the sensitivity of minors' biometric data: verifiable
parental consent, defense-in-depth child safety, jurisdiction-aware consent, and
always-on hard-delete.

## User Stories

### Account, Family & Members
1. As a new visitor, I want to sign up for an account, so that I can start creating storybooks.
2. As a signing-up user, I want my Jurisdiction detected/declared, so that the right consent rules and data-residency region apply to me.
3. As a Guardian, I want to create a Family, so that my Personas and Stories live in one shared space.
4. As a Guardian, I want to invite other adults (dad, grandma) as Members, so that they can make their own personalized stories.
5. As a Guardian, I want to remove a Member, so that I control who can access my child's likeness.
6. As a Member, I want my own login, so that my account is personalized to me.
7. As a Member, I want to link a Self Persona to my account, so that my stories default to featuring me + the baby.
8. As a Member, I want to see which Personas exist in my Family, so that I can choose who stars in a story.
9. As a Guardian, I want to be the only one who can create a Baby Persona, so that consent stays accountable to me.
10. As a non-Guardian Member, I want to create my own Adult Persona, so that I can star in stories without needing the Guardian.

### Consent & Compliance
11. As a Guardian, I want to be shown a clear consent notice before uploading my child's photos, so that I understand what is collected and how it's used.
12. As a Guardian, I want my consent recorded (consent receipt), so that there is proof of what I agreed to and when.
13. As a Guardian, I want to be unable to upload a minor's photos until I have an active paid subscription, so that the payment serves as verifiable parental consent.
14. As a user in a stricter jurisdiction (e.g. India), I want the system to apply the correct child-age threshold (e.g. under-18), so that the product is lawful where I live.
15. As a user, I want my data stored in an appropriate region for my market, so that residency rules are respected.
16. As a Guardian, I want an always-available "delete everything" action, so that I can exercise my right to be forgotten at any time.
17. As an operator, I want markets feature-flagged, so that a country is only enabled once its legal review and residency are ready.

### Persona creation & lifecycle
18. As a Guardian, I want to upload 10–15 photos of my baby, so that a high-quality likeness can be trained.
19. As a Guardian, I want immediate feedback if my photos are unusable (no face, blurry, inconsistent person), so that I don't waste a training run.
20. As a Member, I want a selfie/liveness check when creating my Adult Persona, so that only my own likeness is used.
21. As a Guardian, I want training to start as soon as my photos pass checks, so that I don't sit through a dead wait.
22. As a Guardian, I want to keep building my Brief while training runs, so that the wait feels productive.
23. As a Guardian, I want a notification (email/web push) when my Persona is ready, so that I can return and generate.
24. As a Guardian, I want to see sample generations of my new Persona (likeness confirmation), so that I can accept or re-train before investing in a book.
25. As a Guardian, I want a refund if training fails, so that I'm never charged for a Persona that didn't work.
26. As a Member, I want to see each Persona's state (training/ready/failed), so that I know what's usable.

### Brief & Story generation
27. As a Member, I want to pick which Personas star in a story, so that the book features the right people.
28. As a Member, I want to choose a theme/lesson from a curated menu, so that I get a reliably good story with minimal effort.
29. As a Member, I want to optionally choose a setting/occasion, so that the story fits the moment.
30. As a Member, I want one free-text "anything special?" field, so that I can add personal touches (e.g. "her toy elephant Boo").
31. As a Member, I want my free-text note moderated, so that the product stays safe.
32. As a Member, I want a full draft Storybook generated from my Brief, so that I have something to react to.
33. As a Member, I want each Page to pair a short passage with an illustration of its Scene, so that it reads like a real picture book.
34. As a Member, I want the illustrations to look consistent across pages (style, wardrobe, setting via the Style Bible), so that the book feels coherent.
35. As a Member, I want multi-Persona Pages (baby + me together), so that the whole family appears in scenes.

### Curating the draft
36. As a Member, I want to re-roll a single Page's illustration, so that I can fix one bad image without redoing the book.
37. As a Member, I want to re-roll or edit a single Page's text independently, so that I can refine wording.
38. As a Member, I want each Page to keep candidates, so that I can pick the best version.
39. As a Member, I want to know my remaining re-roll budget, so that I understand when extra re-rolls cost credits.
40. As a Member, I want to buy extra re-rolls, so that I can keep refining beyond the free budget.
41. As a Member, I want my draft to be private to me until finalized, so that half-finished work isn't shown to the Family.
42. As a Member, I want a Page that fails generation/moderation to be isolated (re-tried/quarantined) while other pages proceed, so that one failure doesn't kill the book.
43. As a Member, I want to finalize a Storybook when I'm happy, so that it becomes a shareable keepsake.

### Sharing, export & keepsake
44. As a Member, I want finalized Storybooks visible to all my Family Members, so that the family shares the keepsake.
45. As a Member, I want to export a finalized Storybook as a PDF, so that I keep a durable copy on my device.
46. As a Member, I want to share a finalized Storybook outside the Family via a revocable link, so that I can show grandparents safely.
47. As a Member, I want share links to be non-indexed with optional expiry/passcode, so that my child's likeness isn't broadly exposed.
48. As a Member, I want a warning before sharing externally, so that I understand the link exposes my child's likeness and name.
49. As a Member, I want to revoke a share link at any time, so that I can cut off access.

### Subscription & billing
50. As a user, I want to subscribe to a plan, so that I can create Personas and generate books.
51. As a user, I want higher tiers to allow more Personas, so that bigger families can pay for more.
52. As a user, I want to generate unlimited books under fair use, so that I'm not nickel-and-dimed per book.
53. As a user, I want to manage/cancel my subscription, so that I control my spending.
54. As a user who cancels, I want a 30-day window to export my books, so that I keep my keepsakes.
55. As a user who cancels, I want my sensitive data purged after the export window, so that my family's data isn't held indefinitely.

### Safety & abuse
56. As an operator, I want every uploaded photo screened (CSAM hash-match + safety classifier) before storage/training, so that illegal/unsafe uploads are blocked.
57. As an operator, I want every generated image moderated before the parent sees it, so that unsafe output never reaches a user.
58. As an operator, I want an NCMEC reporting path and audit trail, so that legal reporting obligations are met.
59. As an operator, I want to ban accounts that violate policy, so that the platform stays safe.
60. As a user, I want a way to report abuse, so that harmful content/accounts can be actioned.

## Implementation Decisions

- **Platform:** Next.js web app, Stripe payments (ADR-0003). No native app in v1.
- **Data/auth/storage:** Supabase (Postgres + Auth), **row-level security** enforcing per-Family isolation; uploaded photos and LoRA weights in dedicated encrypted object storage (R2/S3), region-pinnable (ADR-0011, ADR-0015).
- **Job orchestration:** durable workflow platform (Inngest/Trigger.dev) — retryable steps, fan-out across per-Page image generations, `waitForEvent` on fal.ai webhooks, per-step failure isolation (ADR-0011, ADR-0004).
- **Generative pipeline:** Claude Sonnet 4.6 for Story text; one structured-output pass yields Story + per-Page Scene specs + a per-book **Style Bible**; per-Page image **Prompt** = Style Bible + Scene + Persona LoRA(s) (ADR-0012). fal.ai for LoRA training + image inference (ADR-0002).
- **Multi-persona:** sequential per-face inpainting; reference-image model (Gemini 2.5 Flash Image) fallback for multi-Persona Pages if a build-time composition gate fails its bar (ADR-0005).
- **Data model (shapes, not schemas):** Family → Members (with Guardian role); Personas (kind = Baby|Adult, state = training|ready|failed); Storybook (state = generating|draft|finalized) → ordered Pages → Page candidates (text candidate, image candidate); Brief; Style Bible; Consent receipt; Share link (revocable, expiry/passcode); Subscription; Jurisdiction config.
- **Consent engine:** a pure, config-driven `ConsentEngine` resolving (jurisdiction, actor, action) → allowed/required-method. Child-age threshold, consent method, residency, notice version are **per-jurisdiction config**, never hardcoded (ADR-0015, ADR-0008).
- **Persona consent mechanisms:** Baby Persona requires Guardian role + active subscription (payment-VPC) + consent receipt; Adult Persona requires creator selfie/liveness match (ADR-0008, ADR-0014, ADR-0006).
- **Provider adapters:** Anthropic (story), fal.ai (train + infer), moderation (CSAM hash + classifiers), liveness/face-match — each behind an interface so they can be faked in tests and swapped per fallback path.
- **Regeneration:** per-Page, text and image independent, bounded by a per-Storybook re-roll budget; overage via credits (ADR-0004, ADR-0009).
- **Deletion:** `hardDelete(family)` must provably propagate across Postgres, object storage, caches/CDN, and backups (ADR-0007).
- **Sharing:** finalized Storybooks visible to all Family Members; external access only via revocable, non-indexed Share link; drafts private to creating Member (ADR-0013).
- **Onboarding:** train-in-background while Brief is built; auto-generate on training completion; email + web push (onboarding planning doc).

## Testing Decisions

- **Good test = external behavior, not implementation.** Assert on observable outcomes (state transitions, returned artifacts, access allowed/denied), not on internal function calls or React internals.
- **Highest seam preferred: the service/use-case boundary**, with provider adapters faked:
  - `PersonaService.create(photos)` → training → ready/failed; pre-flight checks reject bad inputs without calling the (faked) trainer.
  - `StorybookService.generate(brief)` → draft with N Pages; one faked image failure → that Page quarantined/re-tried, others succeed.
  - `ConsentEngine.check(jurisdiction, actor, action)` → pure, table-driven unit tests across jurisdictions (US under-13, India under-18, etc.).
  - `SharingService` → link mint/revoke/expiry, non-indexing, Family-vs-external visibility.
- **Integration seams (real DB):**
  - RLS isolation — Member of Family A cannot read Family B's Personas/Storybooks.
  - `hardDelete` propagation — after delete, assert nothing remains in DB or (faked) blob store.
- **Provider adapter contract tests** — fakes conform to the same interface as real Anthropic/fal.ai/moderation/liveness clients.
- **Do NOT test** Inngest internals, Stripe internals, or React component rendering details — test the behavior they produce.
- Prior art: none yet (greenfield); these seams establish the testing conventions.

## Out of Scope (v1)

- Audio narration (v2) and video (v3) — see medium roadmap.
- Native mobile app; physical printed books.
- Reference-image custom art styles (copyright surface) — text-descriptor custom styles only.
- Creating a Persona of *another* adult who isn't the account creator (needs its own consent flow).
- "Cloud locker" for churned users' books.
- Multi-login simultaneous co-editing of a single draft.
- Public galleries / discovery.

## Further Notes

- The build-time **multi-Persona composition gate** (ADR-0005) is a launch blocker and should be spiked *before* the surrounding app is built; PRD assumes it passes or the ref-model fallback is used.
- Every image generation incurs an extra moderation call (latency + cost) — fold into unit economics.
- "Child" is **data, not a constant** — every age/consent check reads jurisdiction config.
- Provisional product name "Lullabook"; scope is broad any-occasion stories, not bedtime-only.
