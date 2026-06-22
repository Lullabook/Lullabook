import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";
import { FREE_CAST_LIMIT, castSlotInfo } from "@/lib/cast-limits";

describe("61 — free cast slot limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows up to 3 combined personas + characters when inactive", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_FORCE_SUBSCRIPTION", "inactive");
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-slots", "slots@example.com");

    expect(castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id).canAdd).toBe(true);

    for (let i = 0; i < FREE_CAST_LIMIT; i++) {
      await ctx.characters.create({
        memberId: member.id,
        questionnaire: {
          name: `Friend ${i}`,
          isFictional: true,
          topics: ["play"],
        },
        attestation: "fictional",
      });
    }

    const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);
    expect(slots.used).toBe(FREE_CAST_LIMIT);
    expect(slots.canAdd).toBe(false);
  });
});
