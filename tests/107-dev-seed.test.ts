import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Issue 107 — Dev-only seed reachable from the native app via a Bearer-authed
 * API route. Double-gated: NODE_ENV !== "production" AND DEV_DEMO_SEED === "true".
 * Inert in production / without the flag.
 */
describe("107 — dev-only seed API route", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSeed = process.env.DEV_DEMO_SEED;

  beforeEach(() => {
    // The guard checks NODE_ENV !== "production" (i.e. development) AND the
    // explicit flag. Vitest runs with NODE_ENV="test" which is not "production",
    // so we also need the flag.
    (process.env as Record<string, string>).NODE_ENV = "test";
    process.env.DEV_DEMO_SEED = "true";
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = prevNodeEnv ?? "test";
    if (prevSeed !== undefined) process.env.DEV_DEMO_SEED = prevSeed;
    else delete process.env.DEV_DEMO_SEED;
  });

  function makeReq(): NextRequest {
    return new Request("http://localhost/api/dev/seed", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    }) as unknown as NextRequest;
  }

  it("is inert (403) in production even if the flag is somehow set", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.DEV_DEMO_SEED = "true";
    const { POST } = await import("@/app/api/dev/seed/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("is inert (403) in dev without the explicit flag", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.DEV_DEMO_SEED;
    const { POST } = await import("@/app/api/dev/seed/route");
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated requests (401)", async () => {
    const { POST } = await import("@/app/api/dev/seed/route");
    const req = new Request("http://localhost/api/dev/seed", {
      method: "POST",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
