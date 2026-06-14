import { describe, expect, it } from "vitest";
import { RlsViolationError } from "@/db/store";
import {
  BearerAuthError,
  requireBearerMember,
  type JwtVerifier,
} from "@/lib/bearer-auth";
import { HomeRosterService } from "@/services/home-roster";
import { createTestContext } from "@/test/fixtures";

function fakeVerifier(sub: string, email = "parent@example.com"): JwtVerifier {
  return {
    verify: async (token) => {
      if (token === "bad") throw new Error("invalid");
      return { sub, email, jurisdiction: "US" };
    },
  };
}

function bearerRequest(token: string): Request {
  return new Request("http://localhost/api/home", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("23 — native auth bearer backend", () => {
  it("requireBearerMember verifies JWT and resolves the Member", async () => {
    const ctx = createTestContext();
    ctx.onboarding.ensureFamilyForNewUser("auth-native-1", "native@example.com");

    const { member } = await requireBearerMember(
      bearerRequest("good"),
      fakeVerifier("auth-native-1"),
      () => ctx
    );

    expect(member.authUserId).toBe("auth-native-1");
    expect(member.role).toBe("guardian");
  });

  it("creates Family + Guardian on first Bearer sign-in", async () => {
    const ctx = createTestContext();

    const { member } = await requireBearerMember(
      bearerRequest("good"),
      fakeVerifier("auth-new", "new@example.com"),
      () => ctx
    );

    expect(member.email).toBe("new@example.com");
    expect(ctx.store.families.has(member.familyId)).toBe(true);
  });

  it("rejects missing, invalid, and foreign tokens", async () => {
    const ctx = createTestContext();
    ctx.onboarding.ensureFamilyForNewUser("auth-a", "a@example.com");

    await expect(
      requireBearerMember(new Request("http://localhost/api/home"), fakeVerifier("auth-a"), () => ctx)
    ).rejects.toThrow(BearerAuthError);

    await expect(
      requireBearerMember(bearerRequest("bad"), fakeVerifier("auth-a"), () => ctx)
    ).rejects.toThrow(BearerAuthError);
  });

  it("home roster never crosses Families (RLS)", () => {
    const ctx = createTestContext();
    const memberA = ctx.onboarding.ensureFamilyForNewUser("auth-roster-a", "a@example.com");
    const memberB = ctx.onboarding.ensureFamilyForNewUser("auth-roster-b", "b@example.com");

    ctx.store.savePersona({
      id: "persona-b",
      familyId: memberB.familyId,
      createdByMemberId: memberB.id,
      kind: "baby",
      displayName: "Baby B",
      status: "ready",
      loraWeightKey: "lora/b",
      avatarKey: null,
      createdAt: new Date(),
    });

    const roster = new HomeRosterService(ctx.store);
    expect(roster.getForMember(memberA.id)).toEqual({
      personas: [],
      characters: [],
      subscriptionActive: false,
      hasConsentReceipt: false,
    });

    expect(() =>
      ctx.store.getPersonasByFamily(memberB.familyId, memberA.id)
    ).toThrow(RlsViolationError);
  });
});
