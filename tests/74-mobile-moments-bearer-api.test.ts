import { beforeEach, describe, expect, it, vi } from "vitest";
import { RlsViolationError } from "@/db/store";
import { createTestContext, householdWithBaby } from "@/test/fixtures";
import type { RequestContext } from "@/lib/context";

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "moments-auth-a",
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => harness.ctx!,
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async (token: string) => {
      if (token === "bad") throw new Error("invalid");
      return {
        sub: harness.authSub,
        email: `${harness.authSub}@example.com`,
        jurisdiction: "US",
      };
    },
  }),
}));

import { GET, POST } from "@/app/api/moments/route";

function bearerRequest(
  path: string,
  init: RequestInit & { token?: string } = {}
): Request {
  const { token = "good", ...rest } = init;
  return new Request(`http://localhost${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(rest.headers ?? {}),
    },
  });
}

describe("74 — mobile moments bearer API", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
    harness.authSub = "moments-auth-a";
  });

  it("returns 401 without a bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ babyId: "b1", body: "Hi" }),
      })
    );
    expect(res.status).toBe(401);

    const listRes = await GET(new Request("http://localhost/api/moments?babyId=b1"));
    expect(listRes.status).toBe(401);
  });

  it("creates a moment and lists it for the baby", async () => {
    harness.authSub = "guardian";
    const ctx = harness.ctx!;
    const { baby } = await householdWithBaby(ctx, "Maya");

    const createRes = await POST(
      bearerRequest("/api/moments", {
        method: "POST",
        body: JSON.stringify({
          babyId: baby.id,
          body: "First wave at Nani",
          momentType: "first",
          occurredOn: "2026-06-16",
          significant: true,
        }),
      })
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      moment: { id: string; body: string; isSignificant: boolean };
    };
    expect(created.moment.body).toContain("Nani");
    expect(created.moment.isSignificant).toBe(true);

    const listRes = await GET(bearerRequest(`/api/moments?babyId=${baby.id}`));
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as {
      moments: { id: string; body: string }[];
    };
    expect(listed.moments).toHaveLength(1);
    expect(listed.moments[0].id).toBe(created.moment.id);
  });

  it("never lists another family's moments", async () => {
    const ctx = harness.ctx!;
    const memberA = ctx.onboarding.ensureFamilyForNewUser(harness.authSub, "a@example.com");
    const memberB = ctx.onboarding.ensureFamilyForNewUser("moments-auth-b", "b@example.com");
    const babyB = ctx.babies.addBaby({ memberId: memberB.id, displayName: "Baby B" });

    ctx.moments.create({
      memberId: memberB.id,
      babyId: babyB.id,
      body: "Family B only",
      momentType: "funny",
    });

    expect(() => ctx.moments.list(memberA.id, babyB.id)).toThrow(RlsViolationError);

    const listRes = await GET(bearerRequest(`/api/moments?babyId=${babyB.id}`));
    expect(listRes.status).toBe(400);
  });
});
