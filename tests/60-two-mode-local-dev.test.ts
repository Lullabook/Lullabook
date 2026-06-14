import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";

describe("60 — two-mode local dev free vs paid", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("DEV_FORCE_SUBSCRIPTION=inactive gates baby persona creation", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_FORCE_SUBSCRIPTION", "inactive");
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-free", "free@example.com");
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction);
    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(false);
  });

  it("DEV_FORCE_SUBSCRIPTION=active unlocks baby persona gate when no real subscription", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_FORCE_SUBSCRIPTION", "active");
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-paid", "paid@example.com");
    ctx.subscriptions.recordConsent(member.familyId, member.id, member.jurisdiction);
    const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
    expect(gate.allowed).toBe(true);
  });

  it("DEV_FORCE_SUBSCRIPTION has no effect in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_FORCE_SUBSCRIPTION", "active");
    const ctx = createTestContext();
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-prod", "prod@example.com");
    expect(ctx.subscriptions.isActive(member.familyId)).toBe(false);
  });
});
