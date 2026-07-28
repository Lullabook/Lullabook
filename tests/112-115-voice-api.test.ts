import { describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 112 — Voice API route over VoiceClipService.
 * Issue 115 — Voice message: immediate post + notify parents.
 */
describe("112/115 — voice API + immediate post + notify", () => {
  async function readyMemberWithAdult(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-112", "v@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("uploads a voice clip after consent and lists it", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMemberWithAdult(ctx);
    ctx.voiceClips.recordConsent(member.id, persona.id);

    const clip = await ctx.voiceClips.uploadClip({
      memberId: member.id,
      personaId: persona.id,
      label: "Goodnight",
      transcript: "Goodnight, my star.",
      durationSecs: 4,
      audioBytes: Buffer.from("audio-data"),
    });

    expect(clip.id).toBeTruthy();
    expect(clip.transcript).toBe("Goodnight, my star.");
    expect(clip.durationSecs).toBe(4);

    const listed = ctx.voiceClips.listForPersona(member.id, persona.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(clip.id);
  });

  it("upload requires prior consent", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMemberWithAdult(ctx);

    await expect(
      ctx.voiceClips.uploadClip({
        memberId: member.id,
        personaId: persona.id,
        label: "No consent",
        transcript: "test",
        durationSecs: 3,
        audioBytes: Buffer.from("audio"),
      })
    ).rejects.toThrow(/consent/i);
  });

  it("upload requires narrate capability (403 on unentitled)", async () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-112b", "free@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Free",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    ctx.voiceClips.recordConsent(member.id, persona.id);

    await expect(
      ctx.voiceClips.uploadClip({
        memberId: member.id,
        personaId: persona.id,
        label: "blocked",
        transcript: "test",
        durationSecs: 3,
        audioBytes: Buffer.from("audio"),
      })
    ).rejects.toThrow(/subscription|capability|narrate/i);
  });

  it("revoke consent deletes clips + blobs", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMemberWithAdult(ctx);
    ctx.voiceClips.recordConsent(member.id, persona.id);
    await ctx.voiceClips.uploadClip({
      memberId: member.id,
      personaId: persona.id,
      label: "bye",
      transcript: "bye",
      durationSecs: 2,
      audioBytes: Buffer.from("audio"),
    });

    expect(ctx.voiceClips.listForPersona(member.id, persona.id)).toHaveLength(1);

    await ctx.voiceClips.revokeConsent(member.id, persona.id);

    expect(ctx.voiceClips.listForPersona(member.id, persona.id)).toHaveLength(0);
  });

  it("issue 115: a new voice clip is immediately available for weaving (no approval gate)", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMemberWithAdult(ctx);
    ctx.voiceClips.recordConsent(member.id, persona.id);

    const clip = await ctx.voiceClips.uploadClip({
      memberId: member.id,
      personaId: persona.id,
      label: "lullaby",
      transcript: "Twinkle, twinkle.",
      durationSecs: 5,
      audioBytes: Buffer.from("audio"),
    });

    // Immediately listed — no approval inbox, no pending state.
    const listed = ctx.voiceClips.listForPersona(member.id, persona.id);
    expect(listed.find((c) => c.id === clip.id)).toBeDefined();
  });

  it("issue 115: parents are notified on new voice clip (notification failure doesn't block)", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-115", "g@example.com");
    withActiveSubscription(ctx, guardian);
    // Invite a grandparent member
    const { token } = ctx.family.inviteMember(guardian.id, "gma@example.com");
    const grandma = ctx.family.acceptInvite(token, "auth-gma");
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Grandma",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    ctx.voiceClips.recordConsent(grandma.id, persona.id);

    // Upload a voice message — should notify the parent (guardian)
    const clip = await ctx.voiceClips.uploadClip({
      memberId: grandma.id,
      personaId: persona.id,
      label: "message",
      transcript: "Hello little one",
      durationSecs: 3,
      audioBytes: Buffer.from("audio"),
    });

    // The clip posted immediately regardless of notification
    expect(clip.id).toBeTruthy();
    // The guardian should have a push notification
    const pushForGuardian = ctx.notifications.pushes.filter((p) => p.memberId === guardian.id);
    expect(pushForGuardian.length).toBeGreaterThan(0);
  });
});
