import { describe, expect, it } from "vitest";
import { createTestContext, createReadyAdult, householdWithBaby } from "@/test/fixtures";

describe("38 — voice clips record/store/consent", () => {
  it("requires voice consent before persisting clips", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Nani");

    await expect(
      ctx.voiceClips.uploadClip({
        memberId: guardian.id,
        personaId: adult.id,
        label: "Hello",
        transcript: "Hello moonbeam",
        durationSecs: 6,
        audioBytes: Buffer.from("fake-audio"),
      })
    ).rejects.toThrow(/consent/i);
  });

  it("round-trips record → upload → playback", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Nani");

    ctx.voiceClips.recordConsent(guardian.id, adult.id);
    const clip = await ctx.voiceClips.uploadClip({
      memberId: guardian.id,
      personaId: adult.id,
      label: "Lullaby",
      transcript: "Hush now my little moonbeam",
      durationSecs: 42,
      audioBytes: Buffer.from("fake-audio"),
    });

    expect(clip.transcript).toContain("moonbeam");
    const clips = ctx.voiceClips.listForPersona(guardian.id, adult.id);
    expect(clips).toHaveLength(1);
    const url = await ctx.voiceClips.getPlaybackUrl(guardian.id, clip.id);
    expect(url).toContain("voice/");
  });

  it("revoke purges clips and retains audit", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Nani");
    ctx.voiceClips.recordConsent(guardian.id, adult.id);
    await ctx.voiceClips.uploadClip({
      memberId: guardian.id,
      personaId: adult.id,
      label: "Hi",
      transcript: "Hi",
      durationSecs: 3,
      audioBytes: Buffer.from("audio"),
    });

    await ctx.voiceClips.revokeConsent(guardian.id, adult.id);
    expect(ctx.voiceClips.listForPersona(guardian.id, adult.id)).toHaveLength(0);
    expect(
      [...ctx.store.moderationAudit.values()].some((e) => e.resourceType === "voice_consent")
    ).toBe(true);
  });

  it("hard-delete removes voice blobs", async () => {
    const ctx = createTestContext();
    const { guardian } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Nani");
    ctx.voiceClips.recordConsent(guardian.id, adult.id);
    await ctx.voiceClips.uploadClip({
      memberId: guardian.id,
      personaId: adult.id,
      label: "Hi",
      transcript: "Hi",
      durationSecs: 3,
      audioBytes: Buffer.from("audio"),
    });

    await ctx.hardDelete.hardDelete(guardian.id);
    expect(ctx.blobs.size()).toBe(0);
  });
});
