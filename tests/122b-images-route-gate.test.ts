import { describe, expect, it } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, householdWithBabyUnconfirmed } from "@/test/fixtures";
import { resolveRequestAuth } from "@/lib/request-auth";
import type { RequestContext } from "@/lib/context";
import type { Member } from "@/domain/types";

/**
 * Issue 122 (red-team BUG 5) — diagnostic `.error` / `.moderation` blobs must
 * NOT be client-servable, even to the owning Family. The images route serves
 * illustration/video page blobs only.
 */

function authedReq(
  ctx: ReturnType<typeof createTestContext>,
  member: Member,
  key: string
): Request {
  // Stub resolveRequestAuth by stashing the ctx/member on the request via a
  // module-level spy is heavy; instead exercise the route's key filter directly
  // by constructing the request and calling the guard inline. The route's only
  // Family-scope + servable-extension checks are what we're pinning.
  const req = new Request(
    `http://localhost/api/images?key=${encodeURIComponent(key)}`,
    { headers: { cookie: `session=test` } }
  );
  // Attach the authed pair via a module-level map the test controls.
  AUTHED.set(req, { ctx: ctx as unknown as RequestContext, member });
  return req;
}

const AUTHED = new Map<Request, { ctx: RequestContext; member: Member }>();

describe("122 — images route serves illustration/video blobs only (BUG 5)", () => {
  it("a `.error` diagnostic blob is Forbidden even for the owning Family", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    ctx.personas.acceptLikeness(babyPersona.id, guardian.id);
    // Force every image to fail so an `.error` blob is written (issue 122).
    ctx.fal.failPages = new Set(Array.from({ length: 12 }, (_, i) => i + 1));
    ctx.fal.failImageMessage = "fal.ai request failed (422): internal diagnostics";

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "error blob gate",
    });

    const errorKey = `books/${book.familyId}/${book.id}/page-0.png.attempt-0.error`;
    expect(await ctx.blobs.get(errorKey)).not.toBeNull();

    // Stub resolveRequestAuth to resolve our test ctx/member.
    const vi = await import("vitest");
    const spy = vi.vi
      .spyOn(await import("@/lib/request-auth"), "resolveRequestAuth")
      .mockImplementation(async (req: Request) => AUTHED.get(req) ?? null);

    try {
      const { GET } = await import("@/app/api/images/route");
      const res = await GET(authedReq(ctx, guardian, errorKey));
      expect(res.status).toBe(403);
    } finally {
      spy.mockRestore();
      AUTHED.clear();
    }
  });

  it("a real `.png` illustration blob IS servable to the owning Family", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona, baby } = await householdWithBabyUnconfirmed(ctx);
    ctx.personas.acceptLikeness(babyPersona.id, guardian.id);
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      babyId: baby.id,
      storyType: "bedtime",
      theme: "serve illustration",
    });
    const pages = ctx.store.getPagesForStorybook(book.id);
    const pngKey = pages[0]!.illustrationBlobKey!;
    expect(pngKey).toMatch(/\.png$/);

    const vi = await import("vitest");
    const spy = vi.vi
      .spyOn(await import("@/lib/request-auth"), "resolveRequestAuth")
      .mockImplementation(async (req: Request) => AUTHED.get(req) ?? null);

    try {
      const { GET } = await import("@/app/api/images/route");
      const res = await GET(authedReq(ctx, guardian, pngKey));
      expect(res.status).toBe(307);
    } finally {
      spy.mockRestore();
      AUTHED.clear();
    }
  });
});
