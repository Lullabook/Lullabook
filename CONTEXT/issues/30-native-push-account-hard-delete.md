# 30 — Push + account + in-app hard-delete

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

Native notifications, account management, and the App Store-required in-app
deletion. The app registers a device token after login and the backend sends
**native push** ("Persona ready" / "Storybook ready") via the Expo push service.
An **account** screen shows Members, Jurisdiction notice, and subscription status,
and offers **in-app Delete Account** (hard-delete) with confirmation — entirely
in-app, no web redirect — provably erasing the Family across Postgres, blobs,
**and** push tokens.

## Acceptance criteria

- [ ] Device tokens register/dedupe into a new `push_subscriptions` store
      (implement the existing `PushSubscriptionStore` port); backend sends via
      `expo-server-sdk` at the existing "Persona ready" / "Storybook ready" points.
- [ ] An **account** screen shows Members, Jurisdiction notice, and subscription
      status.
- [ ] **In-app Delete Account** runs the existing hard-delete with confirmation; no
      browser hand-off (satisfies App Store 5.1.1(v)).
- [ ] **Bug fix (hard-delete completeness):** `hardDeleteFamily` clears
      `textStories`, `pendingBriefs`, `moderationAudit`, **and** `push_subscriptions`,
      and `SupabaseDataStore.sync()` does **not** re-upsert the deleted rows
      (extend the cross-store delete test `12-hard-delete`).
- [ ] Tested with a faked push store/adapter; hard-delete propagation across
      Postgres + blobs + push tokens asserted.

## Blocked by

- [26 — Email-Plus VPC + Baby Persona + first illustrated Storybook](./26-native-email-plus-vpc-baby-persona.md)
