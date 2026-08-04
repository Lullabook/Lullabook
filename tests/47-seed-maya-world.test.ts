import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, seedMayaWorld, subscribedGuardian } from "@/test/fixtures";
import { familyMemberStatus } from "@/lib/v2-theme";

describe("47 — seedMayaWorld demo dataset", () => {
  beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
  afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });
  it("builds 5 family members, 4 characters, and 6 stories for the baby", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);

    const { baby } = await seedMayaWorld(ctx, guardian.id);

    const roster = ctx.familyRoster.listForBaby(guardian.id, baby.id);
    expect(roster).toHaveLength(5);

    const characters = ctx.store.getCharactersByFamily(guardian.familyId, guardian.id);
    expect(characters).toHaveLength(4);
    expect(characters.every((c) => c.description.length > 0)).toBe(true);

    const books = ctx.store.listStorybooksForBaby(baby.id, guardian.id);
    expect(books).toHaveLength(6);
  });

  it("produces varied storybook statuses matching the mockup", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const { baby } = await seedMayaWorld(ctx, guardian.id);

    const books = ctx.store.listStorybooksForBaby(baby.id, guardian.id);
    const byStatus = (s: string) => books.filter((b) => b.status === s).length;
    expect(byStatus("finalized")).toBe(4);
    expect(byStatus("draft")).toBe(1);
    expect(byStatus("generating")).toBe(1);
  });

  it("varies family member statuses (ready / training / needs-photos)", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const { baby } = await seedMayaWorld(ctx, guardian.id);

    const roster = ctx.familyRoster.listForBaby(guardian.id, baby.id);
    const statusKeyOf = (name: string) => {
      const view = roster.find((m) => m.persona.displayName === name)!;
      return familyMemberStatus(view.persona.status, view.photoCount).key;
    };

    expect(statusKeyOf("Priya")).toBe("ready");
    expect(statusKeyOf("Ava")).toBe("training");
    expect(statusKeyOf("Uncle Leo")).toBe("needs-photos");
  });

  it("scopes all data to the seeded family (RLS)", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const other = ctx.onboarding.ensureFamilyForNewUser("auth-other47", "other47@example.com");

    await seedMayaWorld(ctx, guardian.id);

    expect(ctx.store.getCharactersByFamily(other.familyId, other.id)).toHaveLength(0);
  });
});
