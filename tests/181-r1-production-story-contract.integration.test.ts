import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadyAdult, createTestContext, householdWithBaby } from "@/test/fixtures";
import { validateGeneratedStoryContract } from "@/adapters/anthropic";

function storyFor(personaIds: string[]) {
  return {
    text: "A calm, complete bedtime story.",
    pages: Array.from({ length: 12 }, (_, index) => ({ index, text: `Page ${index}` })),
    scenes: Array.from({ length: 12 }, (_, pageIndex) => ({
      pageIndex,
      description: `Scene ${pageIndex}`,
      personaIds,
    })),
    styleBible: {
      palette: "warm amber",
      artStyle: "watercolor",
      wardrobe: Object.fromEntries(personaIds.map((id) => [id, "blue pajamas"])),
    },
  };
}

describe("181 — R1 production Story contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects the legacy five-Page choice at the R1 creation boundary", async () => {
    vi.stubEnv("R1_ONE_PLAN", "true");
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);

    await expect(
      ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [babyPersona.id],
        storyType: "bedtime",
        theme: "Too short",
        pageCount: 5,
      })
    ).rejects.toThrow(/exactly 12 Pages/i);
    expect(ctx.anthropic.calls).toHaveLength(0);
  });

  it("requires a non-empty wardrobe entry for every selected Persona", async () => {
    const story = storyFor(["baby", "adult"]);
    story.styleBible.wardrobe.adult = "";

    expect(() => validateGeneratedStoryContract(story, 12, ["baby", "adult"])).toThrow(
      /wardrobe entry/i
    );
  });

  it("records the accepted twelve-Page text attempt before illustration work", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Nani");
    const book = await ctx.storybooks.generate(guardian.id, {
      starringPersonaIds: [babyPersona.id, adult.id],
      storyType: "bedtime",
      theme: "A moonlit walk",
    });
    await ctx.workflow.drain();

    expect(ctx.store.storybooks.get(book.id)?.status).toBe("draft");
    const textAttempt = [...ctx.store.providerCostLedgerEntries.values()].find(
      (entry) => entry.owningEntityIds.storybookId === book.id && entry.attemptType === "text"
    );
    expect(textAttempt).toMatchObject({ provider: "anthropic", outcome: "succeeded" });
  });
});
