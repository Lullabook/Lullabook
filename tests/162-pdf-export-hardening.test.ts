import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestContext,
  generateAndWait,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";
import type { RequestContext } from "@/lib/context";
import type { Member } from "@/domain/types";

/**
 * Debugger hardening pass over the PRD v18 PDF-export surface (issues 160/161).
 *
 * BUG-1 — cross-tenant existence oracle: the dev store's RlsViolationError
 *         message ("…another family") must never reach the 400 body of the
 *         finalize or export routes; a stranger probing ids must see the same
 *         "Storybook not found" shape as a nonexistent id.
 * BUG-2 — finalize-succeeds-but-refetch-fails: the reader must not strand the
 *         parent on stale draft UI with a live "Finalize keepsake" CTA (E4).
 * BUG-3 — session expiry: reader action handlers must redirect to sign-in on
 *         a 401 exactly like load() does, not render "Unauthorized" inline.
 * BUG-4 — the export route gets its own cross-tenant probe (finalize already
 *         had one in tests/160).
 */

const ROOT = process.cwd();
const readMobile = (p: string) => readFileSync(join(ROOT, "mobile", p), "utf8");

async function bookFixture(finalized: boolean) {
  const ctx = createTestContext();
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-162", "a@example.com");
  withActiveSubscription(ctx, member);
  const persona = await ctx.personas.createAdult({
    memberId: member.id,
    displayName: "Star",
    photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    selfie: Buffer.from("selfie"),
  });
  const book = await generateAndWait(ctx, member.id, {
    starringPersonaIds: [persona.id],
    storyType: "bedtime",
    theme: "hardening keepsake",
  });
  if (finalized) ctx.storybooks.finalize(member.id, book.id);
  const stranger = ctx.onboarding.ensureFamilyForNewUser("auth-162-b", "b@example.com");
  withActiveSubscription(ctx, stranger);
  return { ctx, member, stranger, book };
}

async function mockAuth(authed: { ctx: unknown; member: Member } | null): Promise<void> {
  vi.spyOn(await import("@/lib/request-auth"), "resolveRequestAuth").mockResolvedValue(
    authed ? { ctx: authed.ctx as RequestContext, member: authed.member } : null
  );
}

function routeReq(
  id: string,
  path: "finalize" | "export"
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/storybooks/${id}/${path}`, {
      method: path === "finalize" ? "POST" : "GET",
      headers: { authorization: "Bearer test-token" },
    }),
    { params: Promise.resolve({ id }) },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("162 — BUG-1/BUG-4: cross-tenant probes are indistinguishable from unknown ids", () => {
  it("finalize: a stranger probing an existing draft sees the same body as a nonexistent id", async () => {
    const { ctx, member, stranger, book } = await bookFixture(false);
    await mockAuth({ ctx, member: stranger });
    const { POST } = await import("@/app/api/storybooks/[id]/finalize/route");

    const probed = await POST(...routeReq(book.id, "finalize"));
    expect(probed.status).toBe(400);
    const probedBody = await probed.json();
    // The RLS message names "another family" — leaking it confirms the id exists.
    expect(probedBody.error).not.toMatch(/another family|family/i);
    expect(probedBody.error).toBe("Storybook not found");

    const missing = await POST(...routeReq("no-such-id-162", "finalize"));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe(probedBody.error);

    // The draft is untouched by the probe.
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("draft");
  });

  it("export: a stranger probing an existing finalized book sees the same body as a nonexistent id (BUG-4)", async () => {
    const { ctx, member, stranger, book } = await bookFixture(true);
    await mockAuth({ ctx, member: stranger });
    const { GET } = await import("@/app/api/storybooks/[id]/export/route");

    const probed = await GET(...routeReq(book.id, "export"));
    expect(probed.status).toBe(400);
    const probedBody = await probed.json();
    expect(probedBody.error).not.toMatch(/another family|family/i);
    expect(probedBody.error).toBe("Storybook not found");
    // No PDF bytes for a stranger, ever.
    expect(probed.headers.get("Content-Type")).not.toBe("application/pdf");

    const missing = await GET(...routeReq("no-such-id-162", "export"));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe(probedBody.error);

    // The book is untouched by the probe.
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("finalized");
  });

  it("export: the owner still gets the PDF after the hardening (no over-blocking)", async () => {
    const { ctx, member, book } = await bookFixture(true);
    await mockAuth({ ctx, member });
    const { GET } = await import("@/app/api/storybooks/[id]/export/route");
    const res = await GET(...routeReq(book.id, "export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});

describe("162 — BUG-2: finalize-succeeded-but-refetch-failed never strands stale draft UI (E4)", () => {
  const src = readMobile("app/(tabs)/stories/[id].tsx");

  it("the reader records server-confirmed finalization the moment the route succeeds", () => {
    // The flag flips right after the awaited route call — before the refetch
    // can fail — and it is state, not a local book.status flip (E4 guards in
    // tests/160 still forbid setBook(...finalized)).
    expect(src).toMatch(/finalizedOnServer/);
    const handlerStart = src.indexOf("async function confirmFinalize");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = src.slice(handlerStart, src.indexOf("\n  }", handlerStart) + 4);
    expect(handler).toMatch(/await finalizeStorybook\([\s\S]*?setFinalizedOnServer\(true\)/);
    // The refetch still happens (server stays the authority on the full book).
    expect(handler).toContain("await load()");
  });

  it("the draft finalize CTA is gated off once the server confirmed finalization", () => {
    expect(src).toMatch(/isDraft && !finalizedOnServer/);
  });

  it("the stale-draft state renders a reload affordance instead of a re-confirmable CTA", () => {
    expect(src).toMatch(/isDraft && finalizedOnServer/);
    // The recovery card retries via the existing load() and tells the truth:
    // the keepsake is already finalized.
    const cardStart = src.indexOf("isDraft && finalizedOnServer");
    const card = src.slice(cardStart, cardStart + 700);
    expect(card).toMatch(/finalized/i);
    expect(card).toMatch(/onPress=\{load\}/);
  });
});

describe("162 — BUG-3: 401s in reader actions redirect to sign-in like load() does", () => {
  const src = readMobile("app/(tabs)/stories/[id].tsx");

  const handlerSlice = (name: string) => {
    const start = src.indexOf(`async function ${name}`);
    expect(start).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("\n  }", start) + 4);
  };

  for (const name of ["confirmFinalize", "exportPdf", "rerollCurrent", "pickCandidate"]) {
    it(`${name} redirects on an Unauthorized failure instead of an inline error`, () => {
      const handler = handlerSlice(name);
      expect(handler).toMatch(/Unauthorized[\s\S]*?router\.replace\("\/sign-in"\)/);
      // Non-401 failures keep the retryable inline error card.
      expect(handler).toContain("setError(");
    });
  }
});
