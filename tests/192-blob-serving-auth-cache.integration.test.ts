/**
 * Local ticket 192 — Reduce authenticated read and blob-serving cost.
 *
 * Acceptance criteria covered here (server side):
 *  - AC-4: image/avatar responses set `Cache-Control: private` and never
 *    `public`; Family prefix checks stay enforced.
 *  - AC-5: roster avatar requests resolve through the Bearer seam with a
 *    minimal authenticated Family lookup (member row only, no full Family
 *    hydration), and a failed avatar serve returns a graceful 404 with a
 *    private cache header so the client's single placeholder fallback fires.
 *    (The native side of the bearer + onError fallback is reported in the
 *    handoff — mobile/components/roster-avatar.tsx — because mobile/ is a
 *    sibling lane.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestContext, goodPhoto } from "@/test/fixtures";
import { resolveRequestAuth } from "@/lib/request-auth";
import type { RequestContext } from "@/lib/context";
import type { Member } from "@/domain/types";

const AUTHED = new Map<Request, { ctx: RequestContext; member: Member }>();

function authedReq(
  ctx: ReturnType<typeof createTestContext>,
  member: Member,
  url: string
): Request {
  const req = new Request(`http://localhost${url}`, {
    headers: { cookie: `session=test` },
  });
  AUTHED.set(req, { ctx: ctx as unknown as RequestContext, member });
  return req;
}

/** Stub the auth seam (122b pattern) so route handlers run against test ctx. */
async function stubAuthSeam() {
  return vi
    .spyOn(await import("@/lib/request-auth"), "resolveRequestAuth")
    .mockImplementation(async (req: Request) => AUTHED.get(req) ?? null);
}

async function householdAvatar() {
  const ctx = createTestContext();
  const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-192b", "b@example.com");
  const persona = await ctx.personas.createAdult({
    memberId: guardian.id,
    displayName: "Mom",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  expect(persona.avatarKey).toBeTruthy();
  const member = ctx.store.members.get(guardian.id)!;
  return { ctx, member, persona };
}

afterEach(() => {
  AUTHED.clear();
  vi.restoreAllMocks();
});

describe("192 — blob serving: Cache-Control private, never public", () => {
  it("AC-4: the images route sets Cache-Control: private on a served redirect (never public)", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-img", "img@example.com");
    ctx.subscriptions.handleCheckoutCompleted(guardian.familyId, "cus_i", "sub_i");
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const babyPersona = await ctx.personas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const { generateAndWait } = await import("@/test/fixtures");
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "cache header",
    });
    const pages = ctx.store.getPagesForStorybook(book.id);
    const pngKey = pages[0]!.illustrationBlobKey!;

    const spy = await stubAuthSeam();
    try {
      const { GET } = await import("@/app/api/images/route");
      const res = await GET(authedReq(ctx, guardian, `/api/images?key=${encodeURIComponent(pngKey)}`));
      expect(res.status).toBe(307);
      const cacheControl = res.headers.get("Cache-Control") ?? "";
      expect(cacheControl).toContain("private");
      expect(cacheControl).not.toContain("public");
    } finally {
      spy.mockRestore();
    }
  });

  it("AC-4: the images route sets Cache-Control: private on forbidden responses (cross-family key)", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-img2", "img2@example.com");
    const member = ctx.store.members.get(guardian.id)!;
    const spy = await stubAuthSeam();
    try {
      const { GET } = await import("@/app/api/images/route");
      const res = await GET(
        authedReq(ctx, member, "/api/images?key=" + encodeURIComponent("books/other-family/book-1/page-0.png"))
      );
      expect(res.status).toBe(403);
      const cacheControl = res.headers.get("Cache-Control") ?? "";
      expect(cacheControl).toContain("private");
      expect(cacheControl).not.toContain("public");
    } finally {
      spy.mockRestore();
    }
  });

  it("AC-4: the avatars route sets Cache-Control: private on a served redirect and on a forbidden cross-family key", async () => {
    const { ctx, member, persona } = await householdAvatar();
    const spy = await stubAuthSeam();
    try {
      const { GET } = await import("@/app/api/avatars/route");

      const served = await GET(
        authedReq(ctx, member, `/api/avatars?key=${encodeURIComponent(persona.avatarKey!)}`)
      );
      expect(served.status).toBe(307);
      const servedCache = served.headers.get("Cache-Control") ?? "";
      expect(servedCache).toContain("private");
      expect(servedCache).not.toContain("public");

      const forbidden = await GET(
        authedReq(ctx, member, "/api/avatars?key=" + encodeURIComponent("avatars/other-family/p/1.png"))
      );
      expect(forbidden.status).toBe(403);
      const forbiddenCache = forbidden.headers.get("Cache-Control") ?? "";
      expect(forbiddenCache).toContain("private");
      expect(forbiddenCache).not.toContain("public");
    } finally {
      spy.mockRestore();
    }
  });

  it("AC-5: a failed roster-avatar serve falls back once — a graceful 404 with private cache, never a 500", async () => {
    const { member, persona } = await householdAvatar();
    // Blob store whose signedUrl fails (broken backend / missing blob).
    const failing = createTestContext();
    failing.blobs.signedUrl = async () => {
      throw new Error("storage unavailable");
    };
    const spy = await stubAuthSeam();
    try {
      const { GET } = await import("@/app/api/avatars/route");
      const res = await GET(
        authedReq(
          failing,
          member,
          `/api/avatars?key=${encodeURIComponent(persona.avatarKey!)}`
        )
      );
      expect(res.status).toBe(404);
      const cacheControl = res.headers.get("Cache-Control") ?? "";
      expect(cacheControl).toContain("private");
      expect(cacheControl).not.toContain("public");
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Real-bearer proof (191 pattern): the avatars route's auth seam resolves a
// Bearer JWT with a MINIMAL lookup — the members row only, no Family graph.
// ---------------------------------------------------------------------------

const bearerSeam = vi.hoisted(() => {
  function minimalClient() {
    const MEMBER_ROW: Record<string, unknown> = {
      id: "mem-1",
      family_id: "fam-1",
      auth_user_id: "auth-1",
      role: "guardian",
      email: "g@example.com",
      jurisdiction: "US",
      created_at: new Date().toISOString(),
    };
    function makeQuery(table: string) {
      const filters: { kind: "eq" | "in"; column: string; value: unknown }[] = [];
      let single = false;
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return query;
        },
        in(column: string, value: unknown[]) {
          filters.push({ kind: "in", column, value });
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        then(
          onFulfilled?: (v: { data: unknown; error: null }) => unknown,
          onRejected?: (e: unknown) => unknown
        ) {
          let rows = table === "members" ? [MEMBER_ROW] : [];
          for (const f of filters) {
            rows = rows.filter((r) => r[f.column] === f.value);
          }
          const data = single ? (rows[0] ?? null) : rows;
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return query;
    }
    return {
      from: (table: string) => makeQuery(table),
      rpc: async () => ({ data: [], error: null }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
  }
  return { minimalClient };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => bearerSeam.minimalClient(),
  createAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async () => ({ sub: "auth-1", email: "g@example.com", jurisdiction: "US" }),
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

describe("192 — roster avatar bearer serving", () => {
  it("AC-5: resolveRequestAuth (the avatar seam) accepts a Bearer token server-side", async () => {
    const request = new Request("http://localhost/api/avatars?key=x", {
      headers: { Authorization: "Bearer good" },
    });
    const authed = await resolveRequestAuth(request);
    expect(authed).not.toBeNull();
    expect(authed!.member.id).toBe("mem-1");
    expect(authed!.member.familyId).toBe("fam-1");
    // The minimal lookup hydrates the member without the full Family graph.
    expect(authed!.ctx.store.personas.size).toBe(0);
    expect(authed!.ctx.store.families.size).toBe(0);
  });
});
