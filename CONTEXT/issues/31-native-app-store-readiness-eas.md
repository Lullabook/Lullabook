# 31 — App Store readiness: EAS profiles, AASA, in-code requirements + Opus handoff

- Type: **HITL** · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5 writes all code/config; a human (guided by
  **Opus**) does the account/credential/signing/submission steps.

## What to build

Everything required to take the app from simulator-runnable to **App
Store-submittable**, plus the precise human runbook. All App Store requirements
that live in **app code** are implemented; every credential the app consumes is
referenced as a clearly-named env var / placeholder (no secrets committed). The
slice ends by producing `INTEGRATION-FOR-OPUS.md` — the ordered, click-by-click
runbook for the steps only a human can do — and is **HITL** because final
submission depends on that human work.

## Acceptance criteria

- [ ] `mobile/app.json`/`app.config.ts` set bundle id (`com.lullabook.app`),
      version/buildNumber, icons/splash, `scheme`, `ios.associatedDomains`, and the
      **permission usage strings** (`NSCameraUsageDescription`,
      `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, push
      rationale) honestly describing child-photo use.
- [ ] `mobile/eas.json` has development/preview/production build profiles and a
      `submit.production` block with clearly-marked placeholders (`appleId`,
      `ascAppId`, `appleTeamId`).
- [ ] **AASA** hosted at `public/.well-known/apple-app-site-association` (Team ID +
      bundle id + `/auth/callback`, `/share/*` paths; Team ID a placeholder).
- [ ] In-code App Store requirements present: **paywall auto-renew disclosure**
      (3.1.2), **in-app account deletion** (5.1.1(v)), native camera/push/nav/
      offline for **Guideline 4.2**; category **Books/Education, 4+ / parents — not
      the Kids Category**; no "for kids" in name/keywords.
- [ ] `mobile/.env.example` and additions to the root `.env.example` document every
      new secret as a placeholder; **no secrets committed**.
- [ ] `mobile/README.md` (run in simulator + EAS commands) written.
- [ ] **`CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md`** written: ordered, click-by-click
      — Apple Developer enrollment → bundle id + App Store Connect record →
      API/IAP/APNs `.p8` keys (exact pages) → `eas login`/`build:configure`/`build`
      → `eas submit` to TestFlight → create subscription products → wire RevenueCat
      (upload `.p8`s, offerings, webhook) → sandbox IAP test → App Privacy answers →
      screenshots/description/privacy-policy → submit. Each step names the page, the
      credential produced, and where it is pasted.
- [ ] All existing web tests still green; `npx tsc --noEmit` + lint clean for root
      **and** `mobile/`.

## Blocked by

- [26 — Email-Plus VPC + Baby Persona + first illustrated Storybook](./26-native-email-plus-vpc-baby-persona.md)

(Best assembled after the deepening slices 27–30 land, but technically unblocked
once the first paid illustrated path exists.)
