# Pricing + Feature Brainstorm — 2026-06-13

Inputs: 3 background research agents (competitor pricing, launch-pricing strategy,
regional/PPP), the v2 "Maya's World" redesign, and the user's product direction
(free = illustrated stories with fewer pages; paid = narration + video + real
family voice woven into the story, ending in a lullaby).

> These are recommendations + options, not locked decisions. The free/paid split
> below **moves the monetization gate** and therefore needs an ADR update
> (supersedes parts of ADR-0009 / ADR-0016). Don't treat as final until grilled.

## 1. The new free vs paid split (user's direction)

| | Free | Paid ("Illustrated" / premium) |
|---|---|---|
| Stories | Text **+ illustrations**, **fewer pages** (~5), still good writing | Full length (12–16 pages) |
| Narration | — | AI narration **+ real family-voice clips woven in** |
| Video | — | Video stories |
| Voice | — | Record family voices; story wraps around their phrases; ends in a lullaby sung by that person |
| Family voices/likeness | Limited | Multiple members, photos + voice |
| Export / Share | Limited | PDF export, share links, narrated-video share |

**Implication:** illustrations are no longer the paywall (they were in ADR-0009).
The gate is now **narration + video + voice + length**. The emotional/premium hook
= the real-voice narration ("the real money seller" per the user). This matches the
research: emotional/keepsake products win on trust + value framing, not price.

## 2. Recommended launch pricing (US first)

Research clusters US consumer-subscription monthly at **$7.99–$14.99** (modal
~$9.99) and annual at **$74.99–$99.99**. Hard paywall + free trial converts an
unknown app ~5× better than freemium; but the user explicitly wants a free tier as
the acquisition hook — so this is a **freemium + trial-on-premium** hybrid.

**Recommended structure (US):**
- **Free tier** — illustrated short stories (the hook), no card required.
- **Premium monthly: $9.99**
- **Premium annual: $79.99** (~33% off; sits in the modal annual band; "$6.67/mo")
- **7-day free trial of Premium** (hard paywall after), with Day-5 + Day-6
  reminder pushes using family-story preview copy.
- **Founding Family launch offer** (first ~500–1000 subscribers): **$4.99/mo or
  $49.99/yr, locked for life.** Creates urgency + validates demand for an unknown
  app; lets you raise standard price later without churning early believers.

Annual-as-default in the paywall (monthly toggle available) — research shows
annual-default lifts annual uptake ~22% and per-user revenue ~80%, and annual
buyers retain far better (education-category proxy: 44% vs 17% 12-mo retention).

Lead with value, not price: "preserve your family's voices in a storybook starring
your baby — forever," *then* reveal price. Gifting angle is strong (newborn / first
birthday / far-away grandparents).

## 3. Regional pricing (Asia + US launch, per ADR-0015)

Single global USD price leaves 40–70% on the table in Asia. Use per-storefront
App Store tiers. Successful apps price India/SE-Asia at ~30–50% of US.

| Region | Monthly | Annual | Note |
|---|---|---|---|
| US / Canada | $9.99 | $79.99 | baseline |
| Japan | ¥990–¥1,210 (~$7–8) | — | strong ARPU |
| Singapore | SGD 5.99 | SGD 59.99 | higher PPP |
| South Korea | ₩4,900 (~$3.70) | — | |
| India | ₹349 (~$4.20) | ₹2,999 (~$36) | test ₹249 if conversion stalls |
| Indonesia | Rp 99,000 (~$6) | — | auto-converted price kills conversion |
| Philippines | ₱199 (~$3.60) | ₱1,999 | test a weekly tier ($2.99) in SE Asia |

Phase: **launch US first** at $9.99, then soft-launch India + Indonesia with
localized tiers and A/B test (RevenueCat/Adapty), then the rest of Asia.

Sources captured in the three agent runs (RevenueCat State of Subscription Apps
2026, Airbridge, Adapty, Superwall, a16z, Lenny's, regional PPP analyses).

## 4. Feature brainstorm (to make it better)

**Voice / audio (the moat):**
- Real-voice clips per family member (recorded in-app) — done in the v2 design.
- **Lullaby-ending weave** (user's idea): story climaxes into a recorded lullaby
  the person actually sang; system writes the narrative *toward* that phrase.
- "Record this line" prompts — app suggests phrases that fit a story slot.
- Voice-cloned narration (premium, heavy consent) so any page reads in their voice.
- Far-away family: a grandparent records from another country; baby hears them nightly.
- Auto-pronounce the baby's real name + each person's nickname correctly.
- Multi-language narration (Asia launch): same story, Hindi/Tagalog/Japanese voice.

**The "world" / engagement:**
- Multiple babies / siblings — each baby their own World, shared family roster.
- Milestone timeline ("firsts") that auto-suggests a story ("Maya's first steps!").
- Birthday / holiday auto-stories.
- Photo-to-story: parent drops in a real photo from today → a short story from it.
- Growing keepsake archive; weekly new story; streaks; "this time last year."

**Personalization depth:**
- Real pet as a recurring character; favorite toy as a recurring object.
- Real places (home, the garden) styled into the art's Style Bible.

**Sharing / gifting / physical (margin):**
- Gift a subscription (newborn gift angle).
- Grandparent "viewer" role — they watch + record, don't manage.
- Share a **narrated video** to a family group chat.
- **Printed hardcover** of a finalized book — high-margin physical upsell + keepsake.

**Trust / safety:**
- Explicit voice-consent flow (voice = biometric) + per-person revoke.
- Private-by-default; watermark shared video; clear "your data, deletable" stance.

## 4b. Usage-limit research (free vs paid caps) — DEFERRED decision

Agent finding (parked; user deferred gating until code exists):
- Most AI-gen apps reset **daily or monthly**, rarely weekly. Each illustrated story
  has real COGS (~$0.50–$2.50: Claude text + ~4–8 fal images).
- Founder's **2 stories/week free is too costly** at scale (~$10–50k/mo COGS for 10k
  free users vs ~2% freemium conversion). **Monthly caps** are more sustainable +
  easier to explain than weekly.
- Suggested lean (not locked): Free ~2 stories/**month**; Premium ~8/month ($9.99);
  Premium+ ~16/month with video. Voice/video cost extra "credits" from one pool
  (narration ≈2×, video ≈4× a plain story), OR gate by tier. Reset = monthly.
- Verdict on the hypothesis: free too generous, "2/day paid" over-provisioned with no
  clear free→paid gap. Prefer a clear value ladder.

## 4c. Per-page video cost research (for issue 42)

- **Recommended: Kling 3.0 on fal.ai** — ~**$0.35 / 5-sec clip**, ~**$2.10 per 6-page
  book**, ~$2,100/mo at 1,000 books. Best cartoon/kids motion; image-to-video from the
  existing page illustration; ~30–45s/clip, batch 6 via fal queue ≈ 3–8 min.
- Budget fallback: WAN 2.5 ($0.525/clip). Premium: Veo 3.1 (cinematic, pricier).
- Generate **silent**, then **layer the page narration via ffmpeg** (cheaper than
  native-audio models). Per-page idempotent durable step (issue 16).
- Caveat: video model pricing moves monthly — re-check before launch.

## 5. Open product decisions still needing a grill / ADR

- Multiple babies: is "Family" (account) → many "Worlds" (per baby)? Reconciles
  the earlier naming collision (account = Family/Household; per-baby = World).
- Voice consent model (recorded clip vs clone; who may record; revoke).
- New gate line (illustrations free) — rewrite ADR-0009 / ADR-0016.
- Video pipeline: cost + provider (out of current stack).
- Free-tier page count + "fewer but good" generation contract.
