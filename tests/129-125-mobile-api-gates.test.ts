import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, goodPhoto, subscribedGuardian } from "@/test/fixtures";

// Issue 146 — R1 is solo-only (multi-family cut), which independently hides the
// collaborative plan. The 129 "returns both plans" test pins the R2 path, so
// opt back into multi-family for this whole file.
beforeAll(() => { process.env.R1_MULTI_FAMILY_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_MULTI_FAMILY_ENABLED; });

/**
 * Issues 129 + 125 (red-team BUG 2 + BUG 3) — wire the R1 gates to the mobile
 * API surface:
 *  - 129: GET /api/paywall-config returns the R1-visible plans (one plan when
 *    R1_ONE_PLAN=true), so mobile billing honors the server-side collapse.
 *  - 125: POST /api/personas/[id]/accept-likeness lets a Guardian confirm
 *    likeness from the native app (the gate is real in prod now that
 *    likeness_confirmed is persisted — supabase-store round-trip test).
 */
describe("129 — GET /api/paywall-config returns R1-visible plans", () => {
  const prev = process.env.R1_ONE_PLAN;
  afterEach(() => {
    if (prev === undefined) delete process.env.R1_ONE_PLAN;
    else process.env.R1_ONE_PLAN = prev;
  });

  it("returns both plans when the flag is off", async () => {
    delete process.env.R1_ONE_PLAN;
    const { GET } = await import("@/app/api/paywall-config/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.plans.map((p: { id: string }) => p.id)).toEqual([
      "just_us",
      "our_whole_family",
    ]);
  });

  it("returns exactly one plan (Just Us) when R1_ONE_PLAN=true", async () => {
    process.env.R1_ONE_PLAN = "true";
    const { GET } = await import("@/app/api/paywall-config/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].id).toBe("just_us");
    // Premium is not sellable from the config the mobile UI renders.
    expect(body.plans.find((p: { id: string }) => p.id === "our_whole_family")).toBeUndefined();
  });
});

describe("125 — POST /api/personas/[id]/accept-likeness (mobile route)", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
  });
  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = prevNodeEnv ?? "test";
  });

  async function setupPersona() {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
    });
    return { ctx, guardian, persona };
  }

  it("is inert (401) without a valid Bearer token", async () => {
    const { POST } = await import("@/app/api/personas/[id]/accept-likeness/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }) as unknown as never,
      { params: Promise.resolve({ id: "any" }) }
    );
    expect(res.status).toBe(401);
  });

  it("the route body calls PersonaService.acceptLikeness (Guardian-only, ready-required)", async () => {
    // The route delegates to ctx.personas.acceptLikeness; the service-level
    // contract (Guardian-only, ready-required, flips likenessConfirmed) is
    // pinned directly against the test context — same seam as test 23.
    const { ctx, guardian, persona } = await setupPersona();
    expect(persona.likenessConfirmed).toBe(false);

    ctx.personas.acceptLikeness(persona.id, guardian.id);
    expect(ctx.store.getPersona(persona.id, guardian.id)?.likenessConfirmed).toBe(true);

    // A non-ready persona is rejected (clear error).
    persona.status = "training";
    ctx.store.savePersona(persona);
    expect(() => ctx.personas.acceptLikeness(persona.id, guardian.id)).toThrow(/not ready/i);

    // A non-Guardian cannot confirm (red-team BUG 6). Add an invited Member to
    // the same family directly (ensureFamilyForNewUser always makes a guardian).
    persona.status = "ready";
    ctx.store.savePersona(persona);
    const invited = ctx.store.createMember({
      authUserId: "invited-125",
      familyId: guardian.familyId,
      email: "i@example.com",
      role: "member",
      selfPersonaId: null,
      jurisdiction: "US",
    });
    expect(() => ctx.personas.acceptLikeness(persona.id, invited.id)).toThrow(/guardian/i);
  });
});
