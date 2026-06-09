import { describe, expect, it } from "vitest";
import {
  StubAnthropic,
  StubFal,
  StubLiveness,
  StubModeration,
} from "@/adapters/fakes";
import { RlsViolationError } from "@/db/store";
import { PersonaRosterService } from "@/services/persona-roster";
import { createTestContext } from "@/test/fixtures";

describe("01 — walking skeleton", () => {
  it("provisions a Family and Guardian Member on first login", () => {
    const { onboarding, store } = createTestContext();
    const member = onboarding.ensureFamilyForNewUser("auth-1", "parent@example.com");

    expect(member.role).toBe("guardian");
    expect(store.families.has(member.familyId)).toBe(true);
    expect(store.getMembersByFamily(member.familyId)).toHaveLength(1);
  });

  it("returns an empty Persona roster for a new Family", () => {
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-2", "mom@example.com");
    const rosterSvc = new PersonaRosterService(ctx.store);
    expect(rosterSvc.listForCurrentFamily(member.id)).toEqual([]);
  });

  it("enforces RLS — Member of Family A cannot read Family B personas", () => {
    const ctx = createTestContext();
    const memberA = ctx.onboarding.ensureFamilyForNewUser("auth-a", "a@example.com");
    const memberB = ctx.onboarding.ensureFamilyForNewUser("auth-b", "b@example.com");

    ctx.store.savePersona({
      id: "persona-b",
      familyId: memberB.familyId,
      createdByMemberId: memberB.id,
      kind: "adult",
      displayName: "Grandma",
      status: "ready",
      loraWeightKey: "lora/b",
      createdAt: new Date(),
    });

    expect(() =>
      ctx.store.getPersonasByFamily(memberB.familyId, memberA.id)
    ).toThrow(RlsViolationError);
  });

  it("exposes provider adapter stubs for later slices", () => {
    expect(new StubAnthropic()).toBeDefined();
    expect(new StubFal()).toBeDefined();
    expect(new StubModeration()).toBeDefined();
    expect(new StubLiveness()).toBeDefined();
  });
});
