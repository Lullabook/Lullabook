import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InMemoryBlobStore } from "@/adapters/fakes";
import type { FalAdapter } from "@/adapters/types";
import { SupabaseDataStore } from "@/db/supabase-store";
import { DataStore } from "@/db/store";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import {
  LiveFalSpendCapBlockedError,
  LiveFalSpendCapService,
  type LiveFalSpendCheckpoint,
} from "@/services/live-fal-spend-cap";
import { FLUX_2_TRAINER_ENDPOINT } from "@/services/provider-bakeoff";
import { CallbackReachabilityPreflight } from "@/services/callback-reachability";

/**
 * Issue 204 — the $20 live fal.ai spend cap, fail-closed.
 *
 * A real (non dev-only) fal.ai training attempt prices its route from
 * PROVIDER_PRICE_TABLE and reserves that estimate before the provider boundary,
 * durably flushing the hold to storage before any provider await so a crash
 * cannot spend past the cap. Unknown routes fail closed, the exact
 * LIVE_PROVIDER_RUN_APPROVED=true opt-in is required, crossing the warning
 * threshold ($18 default) emits a spend_checkpoint naming remaining budget,
 * failures release their reservation, and the cap is read from configuration.
 *
 * Every assertion runs against in-memory stores / a fake fal — never a paid
 * network. A SupabaseDataStore over a durable table stub proves the
 * pre-provider persistence and restart survival.
 */
function durableClient(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    let deleteMode = false;
    const resolve = () =>
      (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      in() {
        return Promise.resolve({ data: null, error: null });
      },
      delete() {
        deleteMode = true;
        return api;
      },
      upsert(input: Record<string, unknown> | Record<string, unknown>[]) {
        if (deleteMode) return Promise.resolve({ data: null, error: null });
        const rows = Array.isArray(input) ? input : [input];
        tables[table] ??= [];
        for (const row of rows) {
          const index = tables[table].findIndex((existing) => existing.id === row.id);
          if (index === -1) tables[table].push({ ...row });
          else tables[table][index] = { ...tables[table][index], ...row };
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(onFulfilled: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
        return Promise.resolve({ data: resolve(), error: null }).then(onFulfilled);
      },
    };
    return api;
  }
  return { from: (table: string) => query(table) } as unknown as SupabaseClient;
}

describe("204 — live fal.ai spend cap fail-closed", () => {
  const flux2 = {
    endpoint: FLUX_2_TRAINER_ENDPOINT,
    model: "flux-2-lora-v2",
    steps: 300,
  };

  /** A real (non dev-only) fal adapter so the live boundary is exercised. */
  function liveFal(options: { failSubmit?: boolean } = {}): { fal: FalAdapter; calls: () => number } {
    let calls = 0;
    const failSubmit = options.failSubmit === true;
    const fal: FalAdapter = {
      isDevOnly: false,
      async startTraining() {
        calls++;
        return { jobId: `job-${calls}`, status: "queued" };
      },
      async submitTraining() {
        calls++;
        if (failSubmit) throw new Error("provider down");
        return { jobId: `job-${calls}`, status: "queued" };
      },
      async generateImage() {
        throw new Error("not used");
      },
      async inpaintFaces() {
        throw new Error("not used");
      },
      async generateWithReferenceModel() {
        throw new Error("not used");
      },
    };
    return { fal, calls: () => calls };
  }

  function setup(overrides: {
    capUsd?: number;
    warningAtUsd?: number;
    liveRunApproved?: string;
    failSubmit?: boolean;
  } = {}) {
    const store = new DataStore();
    const blobs = new InMemoryBlobStore();
    const checkpoints: LiveFalSpendCheckpoint[] = [];
    const { fal, calls } = liveFal({ failSubmit: overrides.failSubmit });
    const cap = new LiveFalSpendCapService(
      store,
      {
        capUsd: overrides.capUsd,
        warningAtUsd: overrides.warningAtUsd,
        liveRunApproved: overrides.liveRunApproved,
      },
      (checkpoint) => checkpoints.push(checkpoint),
    );
    const service = new FalLoraTrainingService(
      store,
      fal,
      blobs,
      flux2,
      () => new Date("2026-08-06T00:00:00Z"),
      undefined,
      cap,
      // The live boundary is fail-closed on a missing callback origin (issue
      // 203), so give the live spend-cap tests a configured origin to isolate
      // the spend-cap behaviour under test.
      new CallbackReachabilityPreflight({
        callbackBaseUrl: "https://lullabook.vercel.app",
        fetchImpl: async () => Response.json({ ok: true }),
      }),
    );
    return { store, blobs, cap, checkpoints, service, calls, fal };
  }

  function cs(
    service: FalLoraTrainingService,
    familyId: string,
    personaId: string,
    idempotencyKey: string,
    routingDecision?: { endpoint: string; model: string; steps: number },
  ) {
    return service.submit({
      familyId,
      personaId,
      images: [{ filename: "one.jpg", bytes: Buffer.from("x"), moderated: true }],
      defaultCaption: "a subject",
      idempotencyKey,
      routingDecision,
    });
  }

  it("rejects a live fal.ai attempt before the boundary without LIVE_PROVIDER_RUN_APPROVED=true", async () => {
    const { service, calls, cap } = setup({ liveRunApproved: undefined });
    const before = calls();
    await expect(
      cs(service, "family-1", "persona-1", "k-1"),
    ).rejects.toBeInstanceOf(LiveFalSpendCapBlockedError);
    expect(calls()).toBe(before); // no provider boundary reached
    expect([...cap.reservations()]).toHaveLength(0); // nothing reserved
  });

  it("rejects a route absent from PROVIDER_PRICE_TABLE without pricing it as zero", async () => {
    const { service, calls } = setup({ liveRunApproved: "true" });
    const before = calls();
    await expect(
      cs(service, "family-1", "persona-1", "k-unknown", {
        endpoint: "fal-ai/unknown-route",
        model: "unknown-model",
        steps: 300,
      }),
    ).rejects.toThrow(/No versioned price/);
    expect(calls()).toBe(before);
  });

  it("blocks an attempt whose estimate would push cumulative live spend above the cap, reserving nothing", async () => {
    const { service, calls } = setup({ liveRunApproved: "true", capUsd: 0.4 });
    // Each training is 300 steps * 0.0008 = 0.24. One is 0.24 (ok); two is
    // 0.48 which exceeds the 0.4 cap.
    const first = await cs(service, "family-1", "persona-1", "k-1");
    expect(first.requestId).toBe("job-1");
    await expect(
      cs(service, "family-1", "persona-2", "k-2"),
    ).rejects.toBeInstanceOf(LiveFalSpendCapBlockedError);
    expect(calls()).toBe(1); // second never reached the provider
  });

  it("emits a spend_checkpoint naming remaining budget once cumulative spend reaches the warning threshold", async () => {
    const { service, checkpoints } = setup({
      liveRunApproved: "true",
      capUsd: 10,
      warningAtUsd: 2.0,
    });
    // 10 trainings of 0.24 each = 2.4 cumulative; warning fires at/over 2.0.
    for (let i = 0; i < 10; i++) {
      await cs(service, "family-1", `persona-${i}`, `k-${i}`);
    }
    const emitted = checkpoints.filter((c) => c.event === "spend_checkpoint");
    expect(emitted.length).toBeGreaterThan(0);
    const last = emitted[emitted.length - 1]!;
    expect(last.remainingBudgetUsd).toBeCloseTo(10 - 2.4, 5);
    expect(last.cumulativeReservedUsd).toBeCloseTo(2.4, 5);
    expect(last.capUsd).toBe(10);
    expect(last.familyId).toBe("family-1");
    expect(last.provider).toBe("fal.ai");
  });

  it("releases a reservation when the provider attempt fails, so failures cannot exhaust the cap", async () => {
    const { service, cap } = setup({
      liveRunApproved: "true",
      capUsd: 0.5,
      failSubmit: true,
    });
    // Each estimate is 0.24. Three would exceed 0.5 if failures counted, so a
    // third attempt only passes the reserve gate because failures released.
    for (let i = 0; i < 3; i++) {
      await expect(cs(service, "family-1", `persona-${i}`, `kf-${i}`))
        .rejects.toThrow("provider down");
    }
    const reserved = [...cap.reservations()];
    expect(reserved.every((r) => r < 0.5)).toBe(true); // never exhausted
  });

  it("reads the cap from configuration rather than a hardcoded default", async () => {
    expect(new LiveFalSpendCapService(new DataStore(), {}).capUsd()).toBe(20);
    expect(
      new LiveFalSpendCapService(new DataStore(), { capUsd: 33 }).capUsd(),
    ).toBe(33);
  });

  it("holds a reservation in the in-memory ledger so a same-store restart still counts it", async () => {
    const { store, cap } = setup({ liveRunApproved: "true", capUsd: 10 });
    cap.reserve({
      familyId: "family-1",
      personaId: "persona-1",
      provider: "fal.ai",
      endpoint: flux2.endpoint,
      model: flux2.model,
      units: { training_steps: flux2.steps },
      idempotencyKey: "k-durable",
    });
    const held = [...store.providerCostLedgerEntries.values()];
    expect(held).toHaveLength(1);
    expect(held[0]!.outcome).toBe("reserved");
    expect(held[0]!.requestId).toBe("k-durable");
    expect(held[0]!.estimatedCostUsd).toBeCloseTo(0.24, 5);
    const restarted = new LiveFalSpendCapService(store, { liveRunApproved: "true" });
    expect(restarted.reservations()[0]).toBeCloseTo(0.24, 5);
  });

  it("is idempotent per idempotency key: a replayed reserve holds one row, not two", async () => {
    const { store, cap } = setup({ liveRunApproved: "true", capUsd: 10 });
    const input = {
      familyId: "family-1",
      provider: "fal.ai",
      endpoint: flux2.endpoint,
      model: flux2.model,
      units: { training_steps: flux2.steps },
      idempotencyKey: "k-replay",
    };
    const first = cap.reserve(input);
    const replay = cap.reserve(input);
    expect(replay).toEqual(first);
    expect([...store.providerCostLedgerEntries.values()]).toHaveLength(1);
  });

  it("flushes the reservation to durable storage BEFORE the provider boundary and survives a restart", async () => {
    type Row = Record<string, unknown>;
    const tables: Record<string, Row[]> = {
      families: [{ id: "family-durable", created_at: "2026-08-06T00:00:00Z" }],
      members: [],
      provider_cost_ledger: [],
    };
    const client = durableClient(tables);
    const firstStore = new SupabaseDataStore(client);
    await firstStore.hydrateFamily("family-durable");
    const cap = new LiveFalSpendCapService(firstStore, { liveRunApproved: "true", capUsd: 10 });

    let calls = 0;
    const fal: FalAdapter = {
      isDevOnly: false,
      async startTraining() {
        return { jobId: "job-d", status: "queued" };
      },
      async submitTraining() {
        calls++;
        // The provider boundary must observe the reservation already durable.
        const ledger = tables["provider_cost_ledger"] ?? [];
        const held = ledger.find((r) => r.request_id === "k-durable");
        if (!held || held.outcome !== "reserved") {
          throw new Error("reservation not durably persisted before the provider boundary");
        }
        return { jobId: `job-${calls}`, status: "queued" };
      },
      async generateImage() {
        throw new Error("not used");
      },
      async inpaintFaces() {
        throw new Error("not used");
      },
      async generateWithReferenceModel() {
        throw new Error("not used");
      },
    };
    const blobs = new InMemoryBlobStore();
    const service = new FalLoraTrainingService(
      firstStore,
      fal,
      blobs,
      flux2,
      () => new Date("2026-08-06T00:00:00Z"),
      undefined,
      cap,
      new CallbackReachabilityPreflight({
        callbackBaseUrl: "https://lullabook.vercel.app",
        fetchImpl: async () => Response.json({ ok: true }),
      }),
    );

    const result = await service.submit({
      familyId: "family-durable",
      personaId: "persona-1",
      images: [{ filename: "one.jpg", bytes: Buffer.from("x"), moderated: true }],
      defaultCaption: "a subject",
      idempotencyKey: "k-durable",
    });
    expect(result.status).toBe("queued");

    // Simulate a process crash: do NOT call sync(); the only durable write so
    // far is the pre-boundary flush. A fresh store over the same storage must
    // still rehydrate the reservation and hold it against the cap.
    const restarted = new SupabaseDataStore(client);
    await restarted.hydrateFamily("family-durable");
    const rehydrated = [...restarted.providerCostLedgerEntries.values()];
    expect(rehydrated).toHaveLength(1);
    expect(rehydrated[0]!.requestId).toBe("k-durable");
    expect(rehydrated[0]!.outcome).not.toBe("failed");
    expect(rehydrated[0]!.outcome).not.toBe("cancelled");
    expect(new LiveFalSpendCapService(restarted, { liveRunApproved: "true" }).reservations()[0]).toBeCloseTo(0.24, 5);
  });

  it("settles a successful attempt to succeeded and records the provider job id", async () => {
    const { service, store } = setup({ liveRunApproved: "true", capUsd: 10 });
    const result = await cs(service, "family-1", "persona-1", "k-settle-ok");
    expect(result.requestId).toBe("job-1");
    const held = [...store.providerCostLedgerEntries.values()];
    expect(held).toHaveLength(1);
    expect(held[0]!.outcome).toBe("succeeded");
    expect(held[0]!.requestId).toBe("k-settle-ok"); // idempotency key stays the ledger key
    expect(held[0]!.providerRequestId).toBe("job-1");
    expect(service.toClientStatus("job-1").status).toBe("queued");
  });

  it("releases a failed reservation to a terminal failed row, never settled twice", async () => {
    const { service, cap, store } = setup({
      liveRunApproved: "true",
      capUsd: 10,
      failSubmit: true,
    });
    await expect(cs(service, "family-1", "persona-1", "k-fail-settle"))
      .rejects.toThrow("provider down");
    const held = [...store.providerCostLedgerEntries.values()];
    expect(held).toHaveLength(1);
    expect(held[0]!.outcome).toBe("failed");
    // A settled row is terminal: settling again must throw, not rewrite history.
    expect(() =>
      cap.settle({ familyId: "family-1", idempotencyKey: "k-fail-settle", outcome: "succeeded" }),
    ).toThrow(/not in the reserved state/);
    // And settling an unknown key must throw rather than invent a row.
    expect(() =>
      cap.settle({ familyId: "family-1", idempotencyKey: "k-never", outcome: "succeeded" }),
    ).toThrow(/No reserved attempt/);
  });
});
