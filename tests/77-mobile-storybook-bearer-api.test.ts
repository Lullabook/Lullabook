import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  householdWithBaby,
  withActiveSubscription,
} from "@/test/fixtures";
import type { RequestContext } from "@/lib/context";

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "storybook-auth-a",
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

import { GET, POST } from "@/app/api/storybooks/route";

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

describe("77 — mobile storybook bearer API", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
    harness.authSub = "storybook-auth-a";
  });

  it("returns 401 without a bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/storybooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "test" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects generation without an active subscription", async () => {
    harness.authSub = "storybook-free";
    const ctx = harness.ctx as RequestContext;
    const member = ctx.onboarding.ensureFamilyForNewUser("storybook-free", "free@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    const res = await POST(
      bearerRequest("/api/storybooks", {
        method: "POST",
        body: JSON.stringify({
          starringPersonaIds: [persona.id],
          storyType: "bedtime",
          theme: "moonlight",
        }),
      })
    );
    expect(res.status).toBe(402);
  });

  it("creates a storybook and lists it", async () => {
    harness.authSub = "guardian";
    const ctx = harness.ctx as RequestContext;
    const { guardian, baby } = await householdWithBaby(ctx, "Maya");
    withActiveSubscription(ctx, guardian);
    const persona = await ctx.personas.createAdult({
      memberId: guardian.id,
      displayName: "Dada",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });

    const createRes = await POST(
      bearerRequest("/api/storybooks", {
        method: "POST",
        body: JSON.stringify({
          starringPersonaIds: [persona.id],
          babyId: baby.id,
          storyType: "bedtime",
          theme: "A cozy night with fireflies",
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { storybookId: string; status: string };
    expect(["generating", "draft"]).toContain(created.status);

    await (ctx as RequestContext & { workflow: { drain: () => Promise<void> } }).workflow.drain();
    const book = ctx.store.getStorybook(created.storybookId, guardian.id);
    expect(book?.status).toBe("draft");

    const listRes = await GET(bearerRequest("/api/storybooks"));
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { storybooks: { id: string }[] };
    expect(listed.storybooks.some((b) => b.id === created.storybookId)).toBe(true);
  });
});
