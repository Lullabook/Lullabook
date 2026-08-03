import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestContext,
  generateAndWait,
  householdWithBaby,
} from "@/test/fixtures";
import { SHORT_PAGE_COUNT } from "@/domain/story-type";

// Issue 146 — video is a legacy R2 capability. Opt into R2 explicitly; the
// default R1 plan must not construct the video workflow step.
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

describe("42 — video page pipeline", () => {
  it("generates per-page video clips behind a faked adapter", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      storyType: "bedtime",
      theme: "Starlight",
      pageCount: SHORT_PAGE_COUNT,
    });

    expect(ctx.video.calls.length).toBeGreaterThan(0);
    const pages = ctx.store.getPagesForStorybook(book.id);
    const withVideo = pages.filter((p) => p.videoBlobKey);
    expect(withVideo.length).toBeGreaterThan(0);
  });
});
