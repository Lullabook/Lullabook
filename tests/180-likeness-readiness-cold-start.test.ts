import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";
import type { Persona } from "@/domain/types";

const ROOT = join(process.cwd());

function briefFor(personaIds: string[]) {
  return {
    starringPersonaIds: personaIds,
    storyType: "bedtime" as const,
    theme: "A gentle first night",
  };
}

describe("180 — native Likeness readiness and cold-start Brief resume", () => {
  it("training completion creates review samples and a Roster avatar without Story readiness", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    expect(persona.status).toBe("ready");
    expect(persona.likenessConfirmed).toBe(false);
    expect(persona.avatarKey).toMatch(/^avatars\//);
    expect((persona as Persona & { reviewSampleKeys?: string[] }).reviewSampleKeys?.length).toBeGreaterThanOrEqual(2);
    expect(ctx.fal.avatarImageCalls).toBeGreaterThan(0);
    expect(ctx.personas.getLikenessSamples(persona.id, guardian.id)).toHaveLength(
      (persona as Persona & { reviewSampleKeys: string[] }).reviewSampleKeys.length
    );

    await expect(ctx.storybooks.generate(guardian.id, briefFor([persona.id]))).rejects.toThrow(
      /likeness/i
    );
  });

  it("has an authenticated accept boundary and a native review/accept/retry surface wired to it", async () => {
    const routePath = join(ROOT, "src/app/api/personas/[id]/accept-likeness/route.ts");
    const mobilePath = join(ROOT, "mobile/app/likeness/[id].tsx");
    expect(existsSync(routePath)).toBe(true);
    expect(existsSync(mobilePath)).toBe(true);
    expect(readFileSync(routePath, "utf8")).toMatch(/withBearerAuth|requireBearerMember/);
    expect(readFileSync(routePath, "utf8")).toMatch(/acceptLikeness/);
    expect(readFileSync(mobilePath, "utf8")).toMatch(/acceptLikeness|accept-likeness/);
    expect(readFileSync(mobilePath, "utf8")).toMatch(/retry|retrain/i);

    const { POST } = await import("@/app/api/personas/[id]/accept-likeness/route");
    const response = await POST(
      new Request("http://localhost/api/personas/any/accept-likeness", { method: "POST" }) as never,
      { params: Promise.resolve({ id: "any" }) }
    );
    expect(response.status).toBe(401);
  });

  it("is idempotent and preserves the Adult subject self-consent boundary", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const adultSubject = ctx.store.createMember({
      authUserId: "adult-subject",
      familyId: guardian.familyId,
      email: "adult@example.com",
      role: "member",
      selfPersonaId: null,
      jurisdiction: "US",
    });
    const adult = await ctx.rawPersonas.createAdult({
      memberId: adultSubject.id,
      displayName: "Alex",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    expect(ctx.personas.acceptLikeness(adult.id, adultSubject.id).likenessConfirmed).toBe(true);
    expect(ctx.personas.acceptLikeness(adult.id, adultSubject.id).likenessConfirmed).toBe(true);
    expect(() => ctx.personas.acceptLikeness(adult.id, guardian.id)).toThrow(/adult|subject|self/i);

    const baby = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Baby",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    expect(ctx.personas.acceptLikeness(baby.id, guardian.id).likenessConfirmed).toBe(true);
    expect(() => ctx.personas.acceptLikeness(baby.id, adultSubject.id)).toThrow(/guardian/i);
  });

  it("retraining replaces the old review derivatives, avatar, and owned LoRA without exposing source photos", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    const oldSamples = [...((persona as Persona & { reviewSampleKeys?: string[] }).reviewSampleKeys ?? [])];
    const oldAvatar = persona.avatarKey!;
    const oldLora = persona.loraWeightKey!;
    await ctx.blobs.put(oldLora, Buffer.from("old-lora"));

    await ctx.rawPersonas.replacePhotos({
      personaId: persona.id,
      memberId: guardian.id,
      photos: [goodPhoto(0xab), goodPhoto(0xab), goodPhoto(0xab)],
    });

    const replacement = ctx.store.getPersona(persona.id, guardian.id)!;
    expect(replacement.likenessConfirmed).toBe(false);
    expect(replacement.avatarKey).not.toBe(oldAvatar);
    expect((replacement as Persona & { reviewSampleKeys?: string[] }).reviewSampleKeys).not.toEqual(oldSamples);
    expect(await ctx.blobs.get(oldAvatar)).toBeNull();
    expect(await ctx.blobs.get(oldLora)).toBeNull();
    for (const key of oldSamples) expect(await ctx.blobs.get(key)).toBeNull();
    expect((await ctx.blobs.list(`photos/${persona.id}`)).length).toBeGreaterThan(0);
    expect((await ctx.blobs.list(`photos/${persona.id}`)).every((key) => !key.includes("avatar"))).toBe(true);
  });

  it("resumes one waiting Brief exactly once after every selected Persona is ready", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const first: Persona = {
      id: "persona-first",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby" as const,
      displayName: "First",
      status: "training" as const,
      loraWeightKey: null,
      avatarKey: null,
      likenessConfirmed: false,
      createdAt: new Date(),
    };
    const second: Persona = { ...first, id: "persona-second", displayName: "Second" };
    ctx.store.savePersona(first);
    ctx.store.savePersona(second);
    const brief = briefFor([first.id, second.id]);
    ctx.coldStart.submitBriefWhileTraining(guardian.id, first.id, brief);

    first.status = "ready";
    first.loraWeightKey = "lora/first";
    first.likenessConfirmed = true;
    ctx.store.savePersona(first);
    await ctx.coldStart.onPersonaReady(first.id);
    expect(ctx.store.listStorybooksForFamily(guardian.familyId, guardian.id)).toHaveLength(0);

    second.status = "ready";
    second.loraWeightKey = "lora/second";
    second.likenessConfirmed = true;
    ctx.store.savePersona(second);
    await ctx.coldStart.onPersonaReady(second.id);
    await ctx.coldStart.onPersonaReady(second.id);
    await ctx.workflow.drain();

    expect(ctx.store.listStorybooksForFamily(guardian.familyId, guardian.id)).toHaveLength(1);
    expect(ctx.store.pendingBriefs.size).toBe(0);
  });

  it("keeps a waiting Brief visible and recoverable when provider generation fails", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = {
      id: "persona-recoverable",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby" as const,
      displayName: "Recoverable",
      status: "ready" as const,
      loraWeightKey: "lora/recoverable",
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);
    const brief = briefFor([persona.id]);
    ctx.coldStart.submitBriefWhileTraining(guardian.id, persona.id, brief);
    const generate = vi.spyOn(ctx.storybooks, "generate").mockRejectedValueOnce(
      new Error("provider unavailable")
    );

    await expect(ctx.coldStart.onPersonaReady(persona.id)).rejects.toThrow(/provider/i);
    expect(ctx.store.pendingBriefs.size).toBe(1);
    expect((([...ctx.store.pendingBriefs.values()][0]) as typeof ctx.store.pendingBriefs extends Map<string, infer V> ? V & { status?: string } : never).status).toBe("failed");
    generate.mockRestore();
  });

  it("does not spend on full Storybook illustrations before likeness confirmation", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "No Spend",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    await expect(ctx.storybooks.generate(guardian.id, briefFor([persona.id]))).rejects.toThrow(
      /likeness/i
    );
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.store.storybooks.size).toBe(0);
  });
});
