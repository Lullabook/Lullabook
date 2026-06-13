import { describe, expect, it } from "vitest";
import { RealModerationAdapter } from "@/adapters/moderation";
import { createTestContext } from "@/test/fixtures";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { RevenueCatWebhookHandler } from "@/adapters/revenuecat";
import { InMemoryPushSubscriptionStore } from "@/adapters/push-store";
import { FakeNotifications } from "@/adapters/fakes";

describe("24 — native free character text tier", () => {
  it("treats non-numeric moderation class scores as failure", async () => {
    process.env.SIGHTENGINE_API_USER = "test-user";
    process.env.SIGHTENGINE_API_SECRET = "test-secret";
    const adapter = new RealModerationAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          status: "success",
          moderation_classes: { sexual: "high" },
        }),
      }) as Response;

    const result = await adapter.checkText("hello");
    expect(result.allowed).toBe(false);

    global.fetch = originalFetch;
  });

  it("creates fictional Character without consent; rejects real-child Characters", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-char", "char@example.com");

    const fictional = await ctx.characters.create({
      memberId: member.id,
      questionnaire: {
        name: "Dragon",
        isFictional: true,
        topics: ["magic"],
      },
    });
    expect(fictional.displayName).toBe("Dragon");

    await expect(
      ctx.characters.create({
        memberId: member.id,
        questionnaire: { name: "Maya", isFictional: false, topics: ["dinosaurs"] },
        attestation: "I am the guardian",
      })
    ).rejects.toThrow(/fictional|Family roster/i);
  });

  it("generates text-only Story without subscription or fal", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-text", "text@example.com");
    const character = await ctx.characters.create({
      memberId: member.id,
      questionnaire: { name: "Star", isFictional: true },
    });

    const story = await ctx.textStories.generate(member.id, {
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "kindness",
    });

    expect(story.text.length).toBeGreaterThan(0);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
    expect(ctx.fal.trainCalls + ctx.fal.imageCalls).toBe(0);
  });
});

describe("25 — RevenueCat IAP webhook", () => {
  it("activates and cancels subscription via verified webhook", () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-iap", "iap@example.com");
    const handler = new RevenueCatWebhookHandler(ctx.subscriptions, {
      verify: (_p, sig) => sig === "good",
    });

    const activated = handler.handle(
      JSON.stringify({ type: "INITIAL_PURCHASE", app_user_id: member.familyId }),
      "good"
    );
    expect(activated.ok).toBe(true);
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(true);

    handler.handle(
      JSON.stringify({ type: "CANCELLATION", app_user_id: member.familyId }),
      "good"
    );
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });

  it("rejects bad webhook signature", () => {
    const ctx = createTestContext();
    const handler = new RevenueCatWebhookHandler(ctx.subscriptions, {
      verify: () => false,
    });
    const result = handler.handle("{}", "bad");
    expect(result.ok).toBe(false);
  });
});

describe("26 — Email-Plus VPC", () => {
  it("runs requested → link_sent → confirmed with delayed email", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-vpc", "vpc@example.com", "US_IOS");
    const notifications = new FakeNotifications();
    const vpc = new EmailPlusVpcService(ctx.store, notifications, "http://localhost:3000");

    const req = vpc.requestConsent(member.id, "guardian@example.com");
    expect(req.status).toBe("requested");

    const sent = await vpc.sendConsentLink(req.id);
    expect(sent.status).toBe("link_sent");
    expect(notifications.emails).toHaveLength(1);

    const receipt = vpc.confirmConsent(sent.token);
    expect(receipt.noticeVersion).toBe("us-coppa-v1");
    await vpc.sendDelayedConfirmation(sent.id);
    expect(notifications.emails).toHaveLength(2);
    expect(vpc.hasVerifiedConsent(member.familyId)).toBe(true);
  });
});

describe("30 — push + hard-delete completeness", () => {
  it("registers push tokens and purges them on hard-delete", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-push", "push@example.com");
    const push = new InMemoryPushSubscriptionStore(ctx.store);
    await push.registerToken(guardian.id, "ExponentPushToken[abc]");
    expect(ctx.store.pushSubscriptions.size).toBe(1);

    ctx.store.saveTextStory({
      id: "ts-1",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      brief: { starringCharacterIds: ["c1"], storyType: "bedtime", theme: "x" },
      text: "Once upon a time",
      createdAt: new Date(),
    });
    ctx.store.savePendingBrief("k1", {
      memberId: guardian.id,
      personaId: "p1",
      brief: { starringPersonaIds: [], storyType: "bedtime", theme: "x" },
      submittedAt: new Date(),
    });
    ctx.store.saveModerationAudit({
      id: "ma-1",
      resourceType: "text",
      resourceId: guardian.id,
      outcome: "allowed",
      reason: null,
      createdAt: new Date(),
    });

    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.store.textStories.size).toBe(0);
    expect(ctx.store.pendingBriefs.size).toBe(0);
    expect(ctx.store.moderationAudit.size).toBe(0);
    expect(ctx.store.pushSubscriptions.size).toBe(0);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
  });
});
