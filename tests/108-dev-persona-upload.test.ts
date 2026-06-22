import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, withActiveSubscription } from "@/test/fixtures";
import { FakeLiveness } from "@/adapters/fakes";
import { shouldDevBypassLiveness, shouldDevFalFallback } from "@/lib/dev-bypass";

/**
 * Issue 108 — Camera-free real-upload path for the Simulator.
 *
 * In dev (NODE_ENV !== "production" AND DEV_LIVENESS_BYPASS === "true"), the
 * liveness check is bypassed (FakeLiveness wired) and the fal training has a
 * dev fallback so a persona reaches `ready` without live fal keys. Both are
 * inert in production (double-gated, server-authoritative).
 */
describe("108 — dev persona upload (camera-free, liveness bypass, training fallback)", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevBypass = process.env.DEV_LIVENESS_BYPASS;
  const prevFalFallback = process.env.DEV_FAL_FALLBACK;

  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    process.env.DEV_LIVENESS_BYPASS = "true";
    process.env.DEV_FAL_FALLBACK = "true";
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = prevNodeEnv ?? "test";
    if (prevBypass !== undefined) process.env.DEV_LIVENESS_BYPASS = prevBypass;
    else delete process.env.DEV_LIVENESS_BYPASS;
    if (prevFalFallback !== undefined) process.env.DEV_FAL_FALLBACK = prevFalFallback;
    else delete process.env.DEV_FAL_FALLBACK;
  });

  it("dev liveness bypass is inert in production", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.DEV_LIVENESS_BYPASS = "true";
    expect(shouldDevBypassLiveness()).toBe(false);
  });

  it("dev liveness bypass is inert without the explicit flag", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.DEV_LIVENESS_BYPASS;
    expect(shouldDevBypassLiveness()).toBe(false);
  });

  it("dev liveness bypass is active in dev with the flag", () => {
    expect(shouldDevBypassLiveness()).toBe(true);
  });

  it("dev fal training fallback is inert in production", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.DEV_FAL_FALLBACK = "true";
    expect(shouldDevFalFallback()).toBe(false);
  });

  it("dev fal training fallback is active in dev with the flag", () => {
    expect(shouldDevFalFallback()).toBe(true);
  });

  it("FakeLiveness always matches (the dev bypass adapter)", async () => {
    const fake = new FakeLiveness();
    const result = await fake.verifySelfie([goodPhoto()], Buffer.from("any-selfie"));
    expect(result.matched).toBe(true);
  });
});
