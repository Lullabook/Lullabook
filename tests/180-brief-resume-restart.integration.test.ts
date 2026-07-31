import { describe, expect, it, vi } from "vitest";
import { createTestContext, subscribedGuardian } from "@/test/fixtures";
import type { PendingBrief, Persona } from "@/domain/types";

const brief = (personaId: string) => ({
  starringPersonaIds: [personaId],
  storyType: "bedtime" as const,
  theme: "A restart-safe night",
});

describe("180 — durable pending Brief resume", () => {
  it("records accepted Storybook identity and never resubmits it after a restart", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona: Persona = {
      id: "ready-persona",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Ready",
      status: "ready",
      loraWeightKey: "lora/ready",
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);

    ctx.coldStart.submitBriefWhileTraining(guardian.id, persona.id, brief(persona.id));
    await ctx.coldStart.onPersonaReady(persona.id);

    const [[key, accepted]] = [...ctx.store.pendingBriefs.entries()];
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.storybookId).toBeTruthy();
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);

    const restarted = createTestContext();
    restarted.store.savePersona({ ...persona });
    restarted.store.savePendingBrief(key!, structuredClone(accepted!) as PendingBrief);
    const generate = vi.spyOn(restarted.storybooks, "generate");

    await restarted.coldStart.onPersonaReady(persona.id);

    expect(generate).not.toHaveBeenCalled();
    expect(restarted.store.getPendingBrief(key!)?.storybookId).toBe(accepted?.storybookId);
  });

  it("reclaims a stale running Brief but does not submit a fresh running claim", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona: Persona = {
      id: "lease-persona",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Lease",
      status: "ready",
      loraWeightKey: "lora/lease",
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);
    const key = "brief:lease";
    ctx.store.savePendingBrief(key, {
      memberId: guardian.id,
      personaId: persona.id,
      selectedPersonaIds: [persona.id],
      brief: brief(persona.id),
      status: "running",
      claimToken: "another-worker",
      claimExpiresAt: new Date(Date.now() + 60_000),
      submittedAt: new Date(),
    });

    await ctx.coldStart.onPersonaReady(persona.id);
    expect(ctx.store.getPendingBrief(key)?.status).toBe("running");
    expect(ctx.store.storybooks.size).toBe(0);
  });
});
