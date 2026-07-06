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
 * Issue 160 (PRD v18) — Finalize a Storybook end-to-end: thin
 * `POST /api/storybooks/[id]/finalize` route over the existing
 * `StorybookService.finalize`, plus the reader's "Finalize keepsake" CTA.
 *
 * Invariant targets:
 *   E4 — finalize is server-authoritative and deliberate: the confirm sheet
 *        names the re-roll lock; the client refetches, never flips status
 *        locally; failure leaves the draft untouched.
 *   E5 — Maya's World canon on the new UI (tokens, emoji, no raw hexes).
 */

const ROOT = process.cwd();
const readMobile = (p: string) => readFileSync(join(ROOT, "mobile", p), "utf8");

async function draftBookFixture() {
  const ctx = createTestContext();
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-160", "a@example.com");
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
    theme: "finalize keepsake",
  });
  expect(book.status).toBe("draft");
  return { ctx, member, book };
}

/** Stub cookie/bearer resolution so route tests drive the route body itself. */
async function mockAuth(authed: { ctx: unknown; member: Member } | null): Promise<void> {
  vi.spyOn(await import("@/lib/request-auth"), "resolveRequestAuth").mockResolvedValue(
    authed ? { ctx: authed.ctx as RequestContext, member: authed.member } : null
  );
}

function finalizeReq(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/storybooks/${id}/finalize`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("160 — POST /api/storybooks/[id]/finalize (thin route, E4)", () => {
  it("401 when unauthenticated", async () => {
    await mockAuth(null);
    const { POST } = await import("@/app/api/storybooks/[id]/finalize/route");
    const res = await POST(...finalizeReq("whatever"));
    expect(res.status).toBe(401);
  });

  it("finalizes an owned draft; status flips server-side (draft → finalized)", async () => {
    const { ctx, member, book } = await draftBookFixture();
    await mockAuth({ ctx, member });
    const { POST } = await import("@/app/api/storybooks/[id]/finalize/route");
    const res = await POST(...finalizeReq(book.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("finalized");
    const saved = ctx.store.getStorybook(book.id, member.id)!;
    expect(saved.status).toBe("finalized");
    expect(saved.finalizedAt).toBeInstanceOf(Date);
  });

  it("400 (not 500) with the service's message on a non-draft; book untouched", async () => {
    const { ctx, member, book } = await draftBookFixture();
    ctx.storybooks.finalize(member.id, book.id); // already finalized
    const before = ctx.store.getStorybook(book.id, member.id)!.finalizedAt;
    await mockAuth({ ctx, member });
    const { POST } = await import("@/app/api/storybooks/[id]/finalize/route");
    const res = await POST(...finalizeReq(book.id));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/draft/i);
    // Untouched: still finalized, finalizedAt not rewritten.
    const after = ctx.store.getStorybook(book.id, member.id)!;
    expect(after.status).toBe("finalized");
    expect(after.finalizedAt).toEqual(before);
  });

  it("400 (not 500) for an unknown storybook id", async () => {
    const { ctx, member } = await draftBookFixture();
    await mockAuth({ ctx, member });
    const { POST } = await import("@/app/api/storybooks/[id]/finalize/route");
    const res = await POST(...finalizeReq("nope-160"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("a member of another Family cannot finalize the book (ownership scope)", async () => {
    const { ctx, member, book } = await draftBookFixture();
    const stranger = ctx.onboarding.ensureFamilyForNewUser("auth-160-b", "b@example.com");
    withActiveSubscription(ctx, stranger);
    await mockAuth({ ctx, member: stranger });
    const { POST } = await import("@/app/api/storybooks/[id]/finalize/route");
    const res = await POST(...finalizeReq(book.id));
    expect(res.status).toBe(400);
    // The draft is untouched.
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("draft");
  });
});

describe("160 — mobile API helper follows the bearer fetch conventions", () => {
  const api = readMobile("lib/api.ts");

  it("exports finalizeStorybook(id) as a POST through apiFetch (bearer attached there)", () => {
    expect(api).toMatch(/export function finalizeStorybook\(/);
    const fnStart = api.indexOf("export function finalizeStorybook(");
    const fnSlice = api.slice(fnStart, fnStart + 400);
    expect(fnSlice).toContain("apiFetch");
    expect(fnSlice).toContain("/finalize");
    expect(fnSlice).toMatch(/method:\s*"POST"/);
    expect(fnSlice).toContain("encodeURIComponent(id)");
  });
});

describe("160 — reader CTA: draft-only, deliberate confirm, refetch-not-flip (E4/E5)", () => {
  const src = readMobile("app/(tabs)/stories/[id].tsx");

  it("shows 'Finalize keepsake' only when status === \"draft\"", () => {
    // The CTA must be gated on a draft check derived from book.status.
    expect(src).toContain('book.status === "draft"');
    expect(src).toContain("Finalize keepsake");
    // The render site sits inside the draft-gated branch: the gate variable
    // (isDraft) guards the CTA expression.
    expect(src).toMatch(/\bisDraft\b\s*(&&|\?)/);
    const cta = src.indexOf("Finalize keepsake");
    expect(cta).toBeGreaterThan(-1);
  });

  it("the confirm sheet names the re-roll lock before anything happens (E4)", () => {
    // Deliberate, irreversible-step confirm: copy must tell the parent that
    // finalizing locks re-rolls.
    expect(src).toMatch(/lock[a-z]*[^.]{0,80}re-?roll/i);
    // Confirm + cancel affordances exist.
    expect(src).toMatch(/Keep editing|Cancel/);
  });

  it("on confirm it calls the route then refetches — never sets status locally (E4)", () => {
    expect(src).toContain("finalizeStorybook(");
    // The confirm handler awaits the route call and then the existing load().
    const handler = src.slice(src.indexOf("finalizeStorybook("));
    expect(handler).toContain("await load()");
    // The client never flips the status field itself.
    expect(src).not.toMatch(/setBook\([^)]*finalized/);
    expect(src).not.toMatch(/status:\s*"finalized"/);
  });

  it("finalize failure surfaces a retryable error (draft untouched client-side)", () => {
    // The handler catches and routes the message into the existing error card.
    const handlerStart = src.indexOf("async function confirmFinalize");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = src.slice(handlerStart, handlerStart + 700);
    expect(handler).toMatch(/catch/);
    expect(handler).toMatch(/setError\(/);
  });

  it("canon styling: emoji on the CTA, no raw hexes introduced (E5)", () => {
    // The CTA title carries an emoji icon (Maya's World iconography).
    const title = src.match(/title=\{?[^}\n]*Finalize keepsake[^}\n]*\}?/);
    expect(title).not.toBeNull();
    expect(title![0]).toMatch(/\p{Extended_Pictographic}/u);
    // No raw hex colors anywhere in the reader (tokens only).
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
