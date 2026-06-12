import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/fixtures";
import type { TraitQuestionnaire } from "@/domain/types";

function sampleQuestionnaire(overrides: Partial<TraitQuestionnaire> = {}): TraitQuestionnaire {
  return {
    name: "Emma",
    nickname: "Emmy",
    relationships: ["mama", "papa"],
    favoriteAnimals: ["bunny"],
    favoriteToys: ["teddy"],
    songs: ["Twinkle Twinkle"],
    topics: ["dinosaurs"],
    isFictional: false,
    ...overrides,
  };
}

describe("20 — free text-only Story generation", () => {
  it("lets a parent without a subscription generate a text-only Story from Characters", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-text", "text@example.com");

    const emma = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire(),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    const story = await ctx.textStories.generate(guardian.id, {
      starringCharacterIds: [emma.id],
      storyType: "bedtime",
      theme: "cozy forest adventure",
    });

    expect(story.text.length).toBeGreaterThan(0);
    expect(story.familyId).toBe(guardian.familyId);
    expect(story.brief.starringCharacterIds).toEqual([emma.id]);
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);
  });

  it("passes Story Type to Anthropic so bedtime and learning shape the text", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-type", "type@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Leo" }),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    await ctx.textStories.generate(guardian.id, {
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "moonlit meadow",
    });

    await ctx.textStories.generate(guardian.id, {
      starringCharacterIds: [character.id],
      storyType: "learning",
      theme: "counting stars",
    });

    expect(ctx.anthropic.textStoryCalls).toHaveLength(2);
    expect(ctx.anthropic.textStoryCalls[0]).toMatchObject({
      storyType: "bedtime",
      theme: "moonlit meadow",
    });
    expect(ctx.anthropic.textStoryCalls[1]).toMatchObject({
      storyType: "learning",
      theme: "counting stars",
    });
  });

  it("does not invoke fal, BlobStore, Style Bible, or workflow fan-out", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-slim", "slim@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Mia", isFictional: true }),
    });

    const blobCountBefore = ctx.blobs.size();
    await ctx.textStories.generate(guardian.id, {
      starringCharacterIds: [character.id],
      storyType: "bedtime",
      theme: "cloud castle",
    });

    expect(ctx.fal.trainCalls).toBe(0);
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.blobs.size()).toBe(blobCountBefore);
    expect(ctx.workflow.steps).toHaveLength(0);
    expect(ctx.anthropic.calls).toHaveLength(0);
    expect(ctx.anthropic.adaptCalls).toHaveLength(0);
  });

  it("moderates a free-text note like a Brief before generation", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-mod", "mod@example.com");
    ctx.moderation.blockedTexts.push("badword");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Noah" }),
      attestation: "I am a parent/guardian creating this for my own family",
    });

    await expect(
      ctx.textStories.generate(guardian.id, {
        starringCharacterIds: [character.id],
        storyType: "learning",
        theme: "kindness",
        note: "include badword please",
      })
    ).rejects.toThrow(/unsafe/i);

    expect(ctx.anthropic.textStoryCalls).toHaveLength(0);
    const audit = [...ctx.store.moderationAudit.values()];
    expect(audit.some((a) => a.resourceType === "text" && a.outcome === "blocked")).toBe(true);
  });

  it("supports multiple starring Characters and passes their traits to Anthropic", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-multi", "multi@example.com");

    const emma = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Emma" }),
      attestation: "I am a parent/guardian creating this for my own family",
    });
    const dragon = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: sampleQuestionnaire({ name: "Dragon", isFictional: true }),
    });

    const story = await ctx.textStories.generate(guardian.id, {
      starringCharacterIds: [emma.id, dragon.id],
      storyType: "bedtime",
      theme: "teamwork",
      note: "keep it gentle",
    });

    expect(story.brief.starringCharacterIds).toEqual([emma.id, dragon.id]);
    expect(ctx.anthropic.textStoryCalls).toHaveLength(1);
    expect(ctx.anthropic.textStoryCalls[0]?.characters).toHaveLength(2);
    expect(ctx.anthropic.textStoryCalls[0]?.characters[0]?.displayName).toBe("Emma");
    expect(ctx.anthropic.textStoryCalls[0]?.characters[1]?.questionnaire.isFictional).toBe(true);
    expect(ctx.store.getTextStory(story.id, guardian.id)?.text).toBe(story.text);
  });

  it("requires at least one valid Character", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-none", "none@example.com");

    await expect(
      ctx.textStories.generate(guardian.id, {
        starringCharacterIds: [],
        storyType: "bedtime",
        theme: "empty cast",
      })
    ).rejects.toThrow(/character/i);
  });
});
