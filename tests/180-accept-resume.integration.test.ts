import { describe, expect, it, vi, afterEach } from "vitest";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";

const requireBearerMember = vi.fn();
vi.mock("@/lib/bearer-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bearer-auth")>();
  return { ...actual, requireBearerMember };
});

afterEach(() => {
  vi.clearAllMocks();
});

function briefFor(personaId: string) {
  return {
    starringPersonaIds: [personaId],
    storyType: "bedtime" as const,
    theme: "Accept-resume test",
  };
}

describe("180 — accept likeness resumes waiting Briefs over the production route", () => {
  it("POST /api/personas/:id/accept-likeness advances a pending Brief to accepted", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    ctx.coldStart.submitBriefWhileTraining(guardian.id, persona.id, briefFor(persona.id));
    const pending = [...ctx.store.pendingBriefs.values()][0];
    expect(pending?.status).toBe("pending");

    requireBearerMember.mockResolvedValue({
      ctx: ctx as unknown as import("@/lib/context").RequestContext,
      member: guardian,
    });

    const { POST } = await import("@/app/api/personas/[id]/accept-likeness/route");
    const response = await POST(
      new Request(
        `http://localhost/api/personas/${encodeURIComponent(persona.id)}/accept-likeness`,
        {
          method: "POST",
          headers: { Authorization: "Bearer test-token" },
        }
      ) as never,
      { params: Promise.resolve({ id: persona.id }) }
    );

    const body = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(ctx.store.getPersona(persona.id, guardian.id)?.likenessConfirmed).toBe(true);

    const accepted = [...ctx.store.pendingBriefs.values()][0];
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.storybookId).toBeTruthy();
    expect(ctx.store.listStorybooksForFamily(guardian.familyId, guardian.id)).toHaveLength(1);
  });

  it("replaying accept does not double-spend a second Storybook", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });

    ctx.coldStart.submitBriefWhileTraining(guardian.id, persona.id, briefFor(persona.id));
    requireBearerMember.mockResolvedValue({
      ctx: ctx as unknown as import("@/lib/context").RequestContext,
      member: guardian,
    });

    const { POST } = await import("@/app/api/personas/[id]/accept-likeness/route");
    const url = `http://localhost/api/personas/${encodeURIComponent(persona.id)}/accept-likeness`;

    const first = await POST(
      new Request(url, { method: "POST", headers: { Authorization: "Bearer test-token" } }) as never,
      { params: Promise.resolve({ id: persona.id }) }
    );
    expect(first.status).toBe(200);
    const acceptedFirst = [...ctx.store.pendingBriefs.values()][0];
    const firstStorybookId = acceptedFirst?.storybookId;

    const second = await POST(
      new Request(url, { method: "POST", headers: { Authorization: "Bearer test-token" } }) as never,
      { params: Promise.resolve({ id: persona.id }) }
    );
    expect(second.status).toBe(200);

    expect(ctx.store.listStorybooksForFamily(guardian.familyId, guardian.id)).toHaveLength(1);
    const acceptedSecond = [...ctx.store.pendingBriefs.values()][0];
    expect(acceptedSecond?.status).toBe("accepted");
    expect(acceptedSecond?.storybookId).toBe(firstStorybookId);
  });
});
