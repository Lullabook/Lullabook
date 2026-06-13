import { describe, expect, it } from "vitest";
import {
  createTestContext,
  generateAndWait,
  householdWithBaby,
} from "@/test/fixtures";
import { SHORT_PAGE_COUNT } from "@/domain/story-type";

describe("41 — short illustrated story", () => {
  it("generates a ~5-page story through the full pipeline", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      storyType: "everyday",
      theme: "Park picnic",
      pageCount: SHORT_PAGE_COUNT,
    });

    expect(book.status).toBe("draft");
    const pages = ctx.store.getPagesForStorybook(book.id);
    expect(pages).toHaveLength(SHORT_PAGE_COUNT);
    expect(pages.filter((p) => p.generationStatus === "ready").length).toBeGreaterThanOrEqual(3);
  });
});
