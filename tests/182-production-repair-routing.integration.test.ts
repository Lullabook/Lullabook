import { describe, expect, it } from "vitest";
import { FakeFal } from "@/adapters/fakes";
import type { FalImageResult, FalPageImageRequest, FalPageRepairRequest } from "@/adapters/types";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

class NoArtifactFal extends FakeFal {
  repairCalls: FalPageRepairRequest[] = [];

  override async generatePageImage(_input: FalPageImageRequest): Promise<FalImageResult> {
    throw new Error("provider returned no image artifact");
  }

  override async repairPageImage(input: FalPageRepairRequest): Promise<FalImageResult> {
    this.repairCalls.push(input);
    return super.repairPageImage(input);
  }
}

describe("182 — production repair routing", () => {
  it("never sends a repair request when a failed Page has no owned image artifact", async () => {
    const fal = new NoArtifactFal();
    const ctx = createTestContext({ fal });
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-182-repair", "182-repair@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Parent",
      photos: [goodPhoto(1), goodPhoto(2), goodPhoto(3)],
      selfie: Buffer.from("selfie"),
    });

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "repair routing",
    });
    await ctx.workflow.drain();
    const failedPage = ctx.store.getPagesForStorybook(book.id).find((page) => page.index === 0)!;
    expect(failedPage.generationStatus).toBe("failed");

    ctx.storybooks.recoverPage(member.id, failedPage.id);
    await ctx.workflow.drain();
    expect(fal.repairCalls).toEqual([]);
    expect(ctx.store.pages.get(failedPage.id)?.generationStatus).toBe("failed");
  });
});
