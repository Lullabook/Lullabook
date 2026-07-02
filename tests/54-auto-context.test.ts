import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, householdWithBaby, withActiveSubscription } from "@/test/fixtures";

// Issue 148 — R1 defers the Story Context Engine; this suite pins the R2
// auto-context path, so opt back into the journal machinery.
beforeAll(() => { process.env.R1_JOURNAL_MACHINERY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_JOURNAL_MACHINERY_ENABLED; });

describe("54 — auto-context personalization layer", () => {
  it("includes all significant moments and ordinary since last Story", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");

    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Old ordinary",
      occurredOn: "2026-06-01",
      momentType: "cozy",
      isSignificant: false,
    });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Always significant",
      occurredOn: "2026-05-01",
      isSignificant: true,
      momentType: "milestone",
    });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Recent ordinary",
      occurredOn: "2026-06-12",
      momentType: "funny",
    });

    const set = ctx.store.getMomentsForBaby(baby.id, guardian.id);
    expect(set.some((m) => m.body === "Always significant")).toBe(true);
    expect(set.some((m) => m.body === "Recent ordinary")).toBe(true);

    const { AutoContextService } = await import("@/services/auto-context");
    const auto = new AutoContextService(ctx.store);
    const built = auto.buildSet(guardian.id, baby.id);
    expect(built.promptBlock).toContain("Always significant");
    expect(built.promptBlock).toContain("Recent ordinary");
    expect(built.promptBlock).toContain("Old ordinary");
  });

  it("advances watermark only after successful Story text generation", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    withActiveSubscription(ctx, guardian);

    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Before story",
      occurredOn: "2026-06-13",
      momentType: "cozy",
      isSignificant: false,
    });

    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Sleepy stars",
    });
    await ctx.workflow.drain();

    const { AutoContextService } = await import("@/services/auto-context");
    const auto = new AutoContextService(ctx.store);
    expect(auto.buildSet(guardian.id, baby.id).moments.some((m) => m.body === "Before story")).toBe(
      false
    );

    const call = ctx.anthropic.calls.at(-1) as { momentContext?: string } | undefined;
    expect(call?.momentContext).toContain("Before story");
    expect(ctx.store.getStorybook(book.id, guardian.id)?.status).not.toBe("failed");
  });

  it("does not advance watermark on failed generation", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    withActiveSubscription(ctx, guardian);

    ctx.anthropic.response = { text: "", pages: [], scenes: [], styleBible: { palette: "", wardrobe: {}, artStyle: "" } };

    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Should stay",
      occurredOn: "2026-06-13",
    });

    await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Fail case",
    });
    await ctx.workflow.drain();

    const { AutoContextService } = await import("@/services/auto-context");
    const auto = new AutoContextService(ctx.store);
    expect(ctx.store.getAutoContextWatermark(baby.id)?.lastStoryAt).toBeUndefined();
    expect(auto.buildSet(guardian.id, baby.id).promptBlock).toContain("Should stay");
  });
});
