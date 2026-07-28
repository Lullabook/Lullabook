import { describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";
import type { TraitQuestionnaire } from "@/domain/types";

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  memberId: "",
}));

vi.mock("@/lib/auth", () => ({
  requireAuthedContext: async () => {
    if (!harness.ctx) throw new Error("test context missing");
    return {
      ctx: harness.ctx,
      member: harness.ctx.store.members.get(harness.memberId)!,
    };
  },
}));

import { promoteCharacterAction } from "@/lib/actions";

function fictionalQuestionnaire(overrides: Partial<TraitQuestionnaire> = {}): TraitQuestionnaire {
  return {
    name: "Pip the Dragon",
    favoriteAnimals: ["dragons"],
    topics: ["bubbles"],
    isFictional: true,
    ...overrides,
  };
}

describe("21 — Character → Persona upgrade (retired, issue 36)", () => {
  it("retires promote — directs users to Family roster", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-promote", "promote@example.com");

    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    await expect(
      ctx.characters.promoteToPersona({
        characterId: character.id,
        memberId: guardian.id,
        kind: "baby",
        photos: [],
      })
    ).rejects.toThrow(/fictional-only|Family roster|retired/i);
  });

  it("rejects promotion before reading or staging supplied photos", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-action-promote", "action-promote@example.com");
    const character = await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });
    harness.ctx = ctx;
    harness.memberId = guardian.id;
    const blobPut = vi.spyOn(ctx.blobs, "put");
    const workflowRequest = vi.spyOn(ctx.workflow, "requestPersonaCreate");
    const form = new FormData();
    form.set("characterId", character.id);
    form.set("kind", "baby");
    for (let index = 0; index < 3; index++) {
      form.append("photos", new File([Uint8Array.from([index, 1, 2])], `photo-${index}.jpg`));
    }

    const result = await promoteCharacterAction(form);

    expect(result).toMatchObject({ ok: false });
    expect(result).toMatchObject({ error: expect.stringMatching(/fictional-only|Family roster/i) });
    expect(blobPut).not.toHaveBeenCalled();
    expect(workflowRequest).not.toHaveBeenCalled();
  });

  it("creates fictional characters without biometric pipeline", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-unpromoted", "unpromoted@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    expect(ctx.fal.trainCalls).toBe(0);
    expect(ctx.liveness.verifyCalls).toBe(0);
    expect(ctx.blobs.size()).toBe(0);
    expect(ctx.store.personas.size).toBe(0);
  });

  it("hard-delete removes fictional characters", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-del-char", "delchar@example.com");

    await ctx.characters.create({
      memberId: guardian.id,
      questionnaire: fictionalQuestionnaire(),
    });

    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
  });
});
