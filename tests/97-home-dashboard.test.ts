import { describe, expect, it } from "vitest";
import {
  createTestContext,
  householdWithBaby,
  seedMayaWorld,
  generateAndWait,
  goodPhoto,
  subscribedGuardian,
} from "@/test/fixtures";
import { HomeDashboardService } from "@/services/home-dashboard";
import type { Tier } from "@/domain/types";

function setTier(
  ctx: ReturnType<typeof createTestContext>,
  familyId: string,
  tier: Tier
) {
  const existing = ctx.store.getSubscription(familyId);
  ctx.store.saveSubscription({
    familyId,
    status: "active",
    stripeCustomerId: existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: existing?.stripeSubscriptionId ?? null,
    tier,
    updatedAt: new Date(),
  });
}

describe("97 — Baby-hero Home dashboard + context-engine nudge", () => {
  describe("dashboard card set", () => {
    it("renders the hero + primary CTA + four summary cards", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);

      expect(dash.hero).toBeDefined();
      expect(dash.hero.babyName).toBe("Maya");
      expect(dash.hero.primaryCta).toBeDefined();
      expect(dash.cards).toHaveLength(4);
      expect(dash.cards.map((c) => c.kind)).toEqual([
        "continue-reading",
        "story-nudge",
        "this-week",
        "family-activity",
      ]);
    });

    it("continue-reading card shows the last book", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const book = await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [],
        babyId: baby.id,
        storyType: "everyday",
        theme: "A nice day",
      });

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);
      const continueCard = dash.cards.find((c) => c.kind === "continue-reading");
      expect(continueCard).toBeDefined();
      expect(continueCard?.title).toBe("A nice day");
    });

    it("continue-reading is null when no books exist", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);
      const continueCard = dash.cards.find((c) => c.kind === "continue-reading");
      expect(continueCard?.title).toBeNull();
    });
  });

  describe("context-engine nudge", () => {
    it("the nudge is wired to the context engine and surfaces notable moments", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      // Log a significant moment
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: "Maya took her first steps today!",
        occurredOn: new Date().toISOString().slice(0, 10),
        isSignificant: true,
        momentType: "first",
      });

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);
      const nudgeCard = dash.cards.find((c) => c.kind === "story-nudge");
      expect(nudgeCard).toBeDefined();
      expect(nudgeCard?.title).toContain("first steps");
    });

    it("degrades to a friendly default when there's nothing notable", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);
      const nudgeCard = dash.cards.find((c) => c.kind === "story-nudge");
      expect(nudgeCard).toBeDefined();
      expect(nudgeCard?.title).toBeTruthy(); // friendly default, not empty
    });
  });

  describe("this-week / streak card", () => {
    it("shows story count for this week", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [],
        babyId: baby.id,
        storyType: "everyday",
        theme: "Story 1",
      });

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);
      const weekCard = dash.cards.find((c) => c.kind === "this-week");
      expect(weekCard).toBeDefined();
      expect(weekCard?.title).toContain("1");
    });
  });

  describe("family-activity card", () => {
    it("shows family member count", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);
      const famCard = dash.cards.find((c) => c.kind === "family-activity");
      expect(famCard).toBeDefined();
      expect(famCard?.title).toBeTruthy();
    });
  });

  describe("security — no raw uploaded photo", () => {
    it("the dashboard renders no raw uploaded photo — only generated avatars/illustrations", async () => {
      const ctx = createTestContext();
      const { guardian, baby } = await householdWithBaby(ctx);
      setTier(ctx, guardian.familyId, "normal");

      const svc = new HomeDashboardService(ctx.store, ctx.moments, ctx.storybooks);
      const dash = svc.getDashboard(guardian.id, baby.id);

      // The dashboard data should never include raw photo blob keys
      const json = JSON.stringify(dash);
      expect(json).not.toContain("photos/");
      expect(json).not.toContain("raw-photo");
    });
  });
});
