import { describe, expect, it } from "vitest";
import {
  createTestContext,
  createReadyAdult,
  generateAndWait,
  householdWithBaby,
} from "@/test/fixtures";
import { STORY_TYPES } from "@/domain/story-type";

describe("40 — broadened create + 6 story types", () => {
  it("supports all six story types", () => {
    expect(STORY_TYPES).toEqual([
      "everyday",
      "milestone",
      "adventure",
      "lesson",
      "bedtime",
      "silly",
    ]);
  });

  it("always stars the baby in the cast", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Dada");

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [adult.id],
      storyType: "adventure",
      theme: "Snow day",
      artStyle: "watercolor",
    });

    expect(book.brief.starringPersonaIds[0]).toBe(babyPersona.id);
    expect(book.brief.starringPersonaIds).toContain(adult.id);
  });

  it("includes fictional characters in generation brief", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Pip", isFictional: true },
    });

    await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      starringCharacterIds: [character.id],
      storyType: "silly",
      theme: "Bubble dragon",
    });

    const call = ctx.anthropic.calls[0] as { characterNames?: string[] };
    expect(call.characterNames).toContain("Pip");
  });
});
