# Session Handoff — 2026-06-13: Native iOS slices 23–31 (TDD)

Status: historical

Implemented native iOS slices 23–31 per `CONTEXT/planning/prd-v3-native-ios.md`
(116 tests green): Bearer auth + `/api/home`, free Character + text-story routes,
RevenueCat IAP webhook, Email-Plus VPC service/routes, storybook status/recovery
fixes, push register + account hard-delete routes, and App Store readiness
(app.config.ts, eas.json, AASA).

- Binding: mobile API surface is Bearer-authed (`requireBearerMember`); Expo app lives in `/mobile`, sharing types via Metro `@domain/*` from `src/domain/types.ts`.
- Binding: iOS purchases via RevenueCat webhook → `SubscriptionService.handleRevenueCatActivated`; `US_IOS` jurisdiction uses `consentMethod: email_plus`.
- Binding: non-numeric moderation scores fail closed; `hardDeleteFamily` must clear every store map (incl. textStories, pendingBriefs, moderationAudit, pushSubscriptions).

(condensed 2026-07-07 — full text in git history)
