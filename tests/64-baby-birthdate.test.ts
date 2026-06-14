import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/fixtures";

describe("64 — Baby birthDate", () => {
  it("creates a baby with an optional birthDate", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-64a", "birth@example.com");
    const baby = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Maya",
      birthDate: "2024-03-15",
    });
    expect(baby.birthDate).toBe("2024-03-15");
    expect(ctx.babies.getSelected(guardian.id)?.birthDate).toBe("2024-03-15");
  });

  it("updates birthDate on an existing baby", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-64b", "edit@example.com");
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Leo" });
    expect(baby.birthDate).toBeNull();

    const updated = ctx.babies.updateBaby({
      memberId: guardian.id,
      babyId: baby.id,
      birthDate: "2023-11-02",
    });
    expect(updated.birthDate).toBe("2023-11-02");
    expect(ctx.babies.getSelected(guardian.id)?.birthDate).toBe("2023-11-02");
  });

  it("allows clearing birthDate back to null", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-64c", "clear@example.com");
    const baby = ctx.babies.addBaby({
      memberId: guardian.id,
      displayName: "Sam",
      birthDate: "2022-01-01",
    });
    const cleared = ctx.babies.updateBaby({
      memberId: guardian.id,
      babyId: baby.id,
      birthDate: null,
    });
    expect(cleared.birthDate).toBeNull();
  });

  it("ensureDefaultBaby leaves birthDate null", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-64d", "default@example.com");
    const baby = ctx.babies.ensureDefaultBaby(guardian.id, "Baby");
    expect(baby.birthDate).toBeNull();
  });
});
