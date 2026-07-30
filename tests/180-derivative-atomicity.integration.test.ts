import { describe, expect, it } from "vitest";
import { FakeFal } from "@/adapters/fakes";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";

class FailSecondReplacementDerivativeFal extends FakeFal {
  override async generateImage(
    prompt: string,
    loraKey: string,
    options?: { idempotencyKey?: string }
  ) {
    if (options?.idempotencyKey?.includes("replacement") && options.idempotencyKey.endsWith("/1")) {
      throw new Error("replacement derivative failed");
    }
    return super.generateImage(prompt, loraKey, options);
  }
}

describe("180 — atomic likeness derivative replacement", () => {
  it("preserves the accepted likeness and purges staged replacement artifacts when derivatives fail", async () => {
    const fal = new FailSecondReplacementDerivativeFal();
    const ctx = createTestContext({ fal });
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    ctx.personas.acceptLikeness(persona.id, guardian.id);
    const oldAvatar = persona.avatarKey!;
    const oldSamples = [...(persona.reviewSampleKeys ?? [])];
    const oldLora = persona.loraWeightKey!;
    await ctx.blobs.put(oldLora, Buffer.from("old-lora"));

    await expect(
      ctx.rawPersonas.replacePhotos({
        personaId: persona.id,
        memberId: guardian.id,
        photos: [goodPhoto(1), goodPhoto(2), goodPhoto(3)],
      })
    ).rejects.toThrow(/replacement derivative failed/i);

    const current = ctx.store.getPersona(persona.id, guardian.id)!;
    expect(current.likenessConfirmed).toBe(true);
    expect(current.avatarKey).toBe(oldAvatar);
    expect(current.reviewSampleKeys).toEqual(oldSamples);
    expect(current.loraWeightKey).toBe(oldLora);
    expect(await ctx.blobs.get(oldAvatar)).not.toBeNull();
    for (const key of oldSamples) expect(await ctx.blobs.get(key)).not.toBeNull();
    expect(await ctx.blobs.get(oldLora)).not.toBeNull();
    expect(await ctx.blobs.list(`photos-staging/${persona.id}`)).toEqual([]);
  });
});
