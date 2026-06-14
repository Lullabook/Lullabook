import { describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, householdWithBaby } from "@/test/fixtures";

describe("51 — linked people on a Moment", () => {
  it("persists and lists linked roster members and characters", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const nani = await createReadyAdult(ctx, guardian, "Nani");
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Coco", topics: ["Curious"], isFictional: true },
    });

    const moment = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Nani visit with Coco",
      linkedPersonaIds: [nani.id],
      linkedCharacterIds: [character.id],
    });

    const people = ctx.moments.linkedPeopleForMoment(guardian.id, moment.id);
    expect(people).toHaveLength(2);
    expect(people.map((p) => p.name).sort()).toEqual(["Coco", "Nani"]);
  });

  it("cleans up links when a Character is deleted", async () => {
    const ctx = createTestContext();
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: { name: "Pip", topics: ["Brave"], isFictional: true },
    });
    const moment = ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "Adventure",
      linkedCharacterIds: [character.id],
    });

    await ctx.characters.delete({ characterId: character.id, memberId: guardian.id });
    expect(ctx.moments.linkedPeopleForMoment(guardian.id, moment.id)).toHaveLength(0);
  });
});
