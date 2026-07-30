import { describe, expect, it } from "vitest";
import { createReadyAdult, createTestContext, generateAndWait, householdWithBaby } from "@/test/fixtures";
import { AutoContextService } from "@/services/auto-context";
import { StoryContextSelector } from "@/services/context-selector";

/**
 * The source manifest deliberately persists IDs/counts only. Context content
 * remains a just-in-time, family-authorized provider input.
 */
describe("181 — Story Context provenance persistence", () => {
  it("renders accepted relationship language and retains only bounded provenance", async () => {
    const ctx = createTestContext();
    const { guardian, baby, babyPersona } = await householdWithBaby(ctx, "Maya");
    const adult = await createReadyAdult(ctx, guardian, "Priya");
    ctx.familyRoster.updateBond({
      memberId: guardian.id,
      babyId: baby.id,
      personaId: adult.id,
      relationship: "Mom",
      babyCallsThem: "Mama",
      theyCallBaby: "my little star",
    });
    ctx.moments.create({
      memberId: guardian.id,
      babyId: baby.id,
      body: "A first pancake flip",
      occurredOn: "2026-07-01",
      momentType: "first",
      isSignificant: true,
    });

    const selected = await new StoryContextSelector(
      ctx.store,
      new AutoContextService(ctx.store)
    ).selectForBaby(guardian.id, baby.id, [babyPersona.id, adult.id]);
    expect(selected.promptBlock).toContain('calls the baby "my little star"');

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id, adult.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "Pancake moon",
    });
    const provenance = [...ctx.store.storyContextProvenance.values()].find(
      (row) => row.storybookId === book.id
    );

    expect(provenance).toMatchObject({
      familyId: guardian.familyId,
      storybookId: book.id,
      babyId: baby.id,
      personaIds: [babyPersona.id, adult.id],
    });
    const serialized = JSON.stringify(provenance);
    expect(serialized).not.toMatch(/pancake|\.png|\.jpg|photo\//i);
  });
});
