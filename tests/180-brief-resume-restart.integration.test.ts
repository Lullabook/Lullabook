import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseDataStore } from "@/db/supabase-store";
import type { PendingBrief, Persona } from "@/domain/types";
import { workflowEventFromPayload } from "@/adapters/inngest";
import { ColdStartService } from "@/services/cold-start";
import { createTestContext, subscribedGuardian } from "@/test/fixtures";

const routeHarness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "guardian",
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => routeHarness.ctx!,
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async () => ({
      sub: routeHarness.authSub,
      email: `${routeHarness.authSub}@example.com`,
      jurisdiction: "US",
    }),
  }),
}));

const brief = (personaId: string) => ({
  starringPersonaIds: [personaId],
  storyType: "bedtime" as const,
  theme: "A restart-safe night",
});

function bearerAcceptRequest(personaId: string): Request {
  return new Request(`http://localhost/api/personas/${personaId}/accept-likeness`, {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  });
}

beforeEach(() => {
  routeHarness.ctx = null;
  routeHarness.authSub = "guardian";
});

describe("180 — durable pending Brief resume", () => {
  it("records accepted Storybook identity and never resubmits it after a restart", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona: Persona = {
      id: "ready-persona",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Ready",
      status: "ready",
      loraWeightKey: "lora/ready",
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);

    ctx.coldStart.submitBriefWhileTraining(guardian.id, persona.id, brief(persona.id));
    await ctx.coldStart.onPersonaReady(persona.id);

    const [[key, accepted]] = [...ctx.store.pendingBriefs.entries()];
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.storybookId).toBeTruthy();
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);

    const restarted = createTestContext();
    restarted.store.savePersona({ ...persona });
    restarted.store.savePendingBrief(key!, structuredClone(accepted!) as PendingBrief);
    const generate = vi.spyOn(restarted.storybooks, "generate");

    await restarted.coldStart.onPersonaReady(persona.id);

    expect(generate).not.toHaveBeenCalled();
    expect(restarted.store.getPendingBrief(key!)?.storybookId).toBe(accepted?.storybookId);
  });

  it("reclaims a stale running Brief but does not submit a fresh running claim", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona: Persona = {
      id: "lease-persona",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Lease",
      status: "ready",
      loraWeightKey: "lora/lease",
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);
    const key = "brief:lease";
    ctx.store.savePendingBrief(key, {
      memberId: guardian.id,
      personaId: persona.id,
      selectedPersonaIds: [persona.id],
      brief: brief(persona.id),
      status: "running",
      claimToken: "another-worker",
      claimExpiresAt: new Date(Date.now() + 60_000),
      submittedAt: new Date(),
    });

    await ctx.coldStart.onPersonaReady(persona.id);
    expect(ctx.store.getPendingBrief(key)?.status).toBe("running");
    expect(ctx.store.storybooks.size).toBe(0);
  });

  it("resumes a migrated legacy Brief whose selected Persona list persisted as empty", async () => {
    const ctx = createTestContext();
    const guardian = await subscribedGuardian(ctx);
    const persona: Persona = {
      id: "legacy-empty-selection",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Legacy",
      status: "ready",
      loraWeightKey: "lora/legacy",
      avatarKey: null,
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);
    ctx.store.savePendingBrief("brief:legacy", {
      memberId: guardian.id,
      personaId: persona.id,
      selectedPersonaIds: [],
      brief: brief(persona.id),
      status: "pending",
      submittedAt: new Date(),
    });

    await ctx.coldStart.onPersonaReady(persona.id);

    expect(ctx.store.getPendingBrief("brief:legacy")).toMatchObject({
      status: "accepted",
      selectedPersonaIds: [persona.id],
    });
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);
  });

  it("enters through authenticated accept-likeness and resumes only after every selected Persona is accepted", async () => {
    let store!: SupabaseDataStore;
    const rpc = vi.fn(async (_name: string, args: Record<string, string>) => {
      const pending = store.getPendingBrief(args.p_key)!;
      return {
        data: {
          key: args.p_key,
          member_id: pending.memberId,
          persona_id: pending.personaId,
          brief: pending.brief,
          selected_persona_ids: pending.selectedPersonaIds,
          status: "running",
          claim_token: args.p_claim_token,
          claim_expires_at: args.p_lease_expires_at,
          claimed_at: args.p_now,
          submitted_at: pending.submittedAt.toISOString(),
          storybook_id: pending.storybookId ?? null,
          accepted_at: null,
          failed_at: null,
          error: null,
          claimed_now: true,
        },
        error: null,
      };
    });
    store = new SupabaseDataStore({ rpc } as unknown as SupabaseClient);
    const ctx = createTestContext({ store });
    routeHarness.ctx = ctx;
    const guardian = await subscribedGuardian(ctx);
    vi.spyOn(store, "hydrateByAuthUser").mockImplementation(async (authUserId) =>
      store.getMemberByAuthUserId(authUserId)
    );
    const first: Persona = {
      id: "route-persona-first",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "First",
      status: "ready",
      loraWeightKey: "lora/route-first",
      avatarKey: null,
      likenessConfirmed: false,
      createdAt: new Date(),
    };
    const second: Persona = {
      ...first,
      id: "route-persona-second",
      displayName: "Second",
      loraWeightKey: "lora/route-second",
    };
    ctx.store.savePersona(first);
    ctx.store.savePersona(second);
    ctx.coldStart.submitBriefWhileTraining(guardian.id, first.id, {
      ...brief(first.id),
      starringPersonaIds: [first.id, second.id],
    });

    const claimBeforeSpend: string[] = [];
    const storeWithClaim = ctx.store as typeof ctx.store & {
      claimPendingBrief: (...args: [string, string, Date, Date]) => Promise<unknown>;
    };
    expect(typeof storeWithClaim.claimPendingBrief).toBe("function");
    const originalClaim = storeWithClaim.claimPendingBrief.bind(storeWithClaim);
    vi.spyOn(storeWithClaim, "claimPendingBrief").mockImplementation(async (...args) => {
      claimBeforeSpend.push("claim");
      return originalClaim(...args);
    });
    const originalGenerate = ctx.storybooks.generate.bind(ctx.storybooks);
    vi.spyOn(ctx.storybooks, "generate").mockImplementation(async (...args) => {
      claimBeforeSpend.push("spend");
      return originalGenerate(...args);
    });

    const { POST } = await import("@/app/api/personas/[id]/accept-likeness/route");
    const firstResponse = await POST(bearerAcceptRequest(first.id), {
      params: Promise.resolve({ id: first.id }),
    });
    expect(firstResponse.status).toBe(200);
    expect(ctx.store.storybooks.size).toBe(0);

    const secondResponse = await POST(bearerAcceptRequest(second.id), {
      params: Promise.resolve({ id: second.id }),
    });
    expect(secondResponse.status).toBe(200);
    expect(claimBeforeSpend).toEqual(["claim", "spend"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("app_claim_pending_brief");
    expect(ctx.store.storybooks.size).toBe(1);
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);
    expect([...ctx.store.pendingBriefs.values()][0]).toMatchObject({ status: "accepted" });

    const replay = await POST(bearerAcceptRequest(second.id), {
      params: Promise.resolve({ id: second.id }),
    });
    expect(replay.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(ctx.store.storybooks.size).toBe(1);
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);
  });

  it("recovers a dispatch failure by reusing one durable Storybook and one allowance reservation", async () => {
    const ctx = createTestContext();
    routeHarness.ctx = ctx;
    const guardian = await subscribedGuardian(ctx);
    const persona: Persona = {
      id: "dispatch-recovery-persona",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Recovery",
      status: "ready",
      loraWeightKey: "lora/recovery",
      avatarKey: null,
      likenessConfirmed: false,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);
    ctx.coldStart.submitBriefWhileTraining(guardian.id, persona.id, brief(persona.id));

    let dispatchAttempts = 0;
    const lifecycle: string[] = [];
    const enqueueGeneration = ctx.storybooks.enqueueGeneration.bind(ctx.storybooks);
    vi.spyOn(ctx.storybooks, "enqueueGeneration").mockImplementation((...args) => {
      lifecycle.push("enqueue");
      return enqueueGeneration(...args);
    });
    ctx.coldStart = new ColdStartService(ctx.store, ctx.storybooks, {
      persist: async () => { lifecycle.push("persist"); },
      dispatch: async () => {
        lifecycle.push("dispatch");
        dispatchAttempts++;
        if (dispatchAttempts === 1) throw new Error("queue unavailable");
        await ctx.workflow.flush();
      },
    });

    const { POST } = await import("@/app/api/personas/[id]/accept-likeness/route");
    const failed = await POST(bearerAcceptRequest(persona.id), {
      params: Promise.resolve({ id: persona.id }),
    });
    expect(failed.status).toBe(400);
    expect(lifecycle.slice(0, 3)).toEqual(["persist", "enqueue", "dispatch"]);
    const [[pendingKey, afterFailure]] = [...ctx.store.pendingBriefs.entries()];
    expect(afterFailure).toMatchObject({ status: "failed" });
    expect(afterFailure.storybookId).toBeTruthy();
    expect(ctx.store.storybooks.size).toBe(1);
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);

    // Simulate a restart after the Storybook row committed but before the
    // pending-Brief pointer upsert did. The deterministic ID must rediscover it.
    ctx.store.savePendingBrief(pendingKey, {
      ...afterFailure,
      status: "failed",
      storybookId: undefined,
    });

    const recovered = await POST(bearerAcceptRequest(persona.id), {
      params: Promise.resolve({ id: persona.id }),
    });
    expect(recovered.status).toBe(200);
    expect([...ctx.store.pendingBriefs.values()][0]).toMatchObject({ status: "accepted" });
    expect(ctx.store.storybooks.size).toBe(1);
    expect(ctx.store.storyAllowanceReservations.size).toBe(1);
    expect(dispatchAttempts).toBe(2);
  });

  it("gives Storybook dispatch retries a stable provider-queue dedupe id", () => {
    expect(workflowEventFromPayload({
      type: "storybook-generate",
      storybookId: "storybook-stable",
      memberId: "member-stable",
    })).toMatchObject({ id: "storybook-storybook-stable" });
  });
});
