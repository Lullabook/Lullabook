import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InMemoryBlobStore } from "@/adapters/fakes";
import type { FalAdapter } from "@/adapters/types";
import { SupabaseDataStore } from "@/db/supabase-store";
import { DataStore } from "@/db/store";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import { LiveFalSpendCapService } from "@/services/live-fal-spend-cap";
import {
  CallbackReachabilityPreflight,
  CallbackUnreachableError,
} from "@/services/callback-reachability";
import {
  CALLBACK_ORIGIN_ENV,
  CallbackOriginConfigError,
  assertCallbackOriginConfigured,
  callbackEndpointUrl,
  resolveCallbackOrigin,
} from "@/services/callback-origin";
import { FLUX_2_TRAINER_ENDPOINT } from "@/services/provider-bakeoff";

/**
 * Issue 203 — deploy-to-Vercel callback origin + reachability preflight (FAIL-6)
 * + SEC-1 (provider keys never client-visible). Fibonacci of FAIL-6/SEC-1.
 *
 * A training submission must call a reachability preflight against the
 * configured public callback base URL before ANY fal.ai request and BEFORE any
 * spend is reserved; a configured-but-unreachable origin fails closed naming the
 * URL (FAIL-6). The callback origin is read from configuration, never hardcoded,
 * and a missing value fails closed at startup. Every probe is deterministic via
 * an injected fetch — never the live network.
 */

const flux2 = {
  endpoint: FLUX_2_TRAINER_ENDPOINT,
  model: "flux-2-lora-v2",
  steps: 300,
};

const ORIGIN = "https://lullabook.vercel.app";

function fakeResponse(): Response {
  return Response.json({ ok: true });
}

function liveFal(log?: string[]): { fal: FalAdapter; calls: () => number } {
  let calls = 0;
  const fal: FalAdapter = {
    isDevOnly: false,
    async startTraining() {
      return { jobId: "job-s", status: "queued" };
    },
    async submitTraining() {
      calls++;
      log?.push("fal");
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

function input(overrides: Partial<Parameters<FalLoraTrainingService["submit"]>[0]> = {}) {
  return {
    familyId: "family-1",
    personaId: "persona-1",
    images: [{ filename: "one.jpg", bytes: Buffer.from("x"), moderated: true }],
    defaultCaption: "a subject",
    idempotencyKey: "k-203",
    ...overrides,
  };
}

function build(opts: {
  fal?: FalAdapter;
  preflight?: CallbackReachabilityPreflight;
  cap?: LiveFalSpendCapService;
  store?: DataStore;
} = {}) {
  const store = opts.store ?? new DataStore();
  const blobs = new InMemoryBlobStore();
  const fal = opts.fal ?? liveFal().fal;
  const cap = opts.cap ?? new LiveFalSpendCapService(store, { liveRunApproved: "true" });
  const service = new FalLoraTrainingService(
    store,
    fal,
    blobs,
    flux2,
    () => new Date("2026-08-06T00:00:00Z"),
    undefined,
    cap,
    opts.preflight,
  );
  return { store, blobs, service, fal, cap };
}

describe("203 — public callback URL reachability preflight (FAIL-6)", () => {
  it("calls the reachability preflight BEFORE any reserve and BEFORE any fal.ai request", async () => {
    const order: string[] = [];
    let ledgerAtPreflight = -1;
    const preflight = new CallbackReachabilityPreflight({
      callbackBaseUrl: ORIGIN,
      fetchImpl: async () => {
        order.push("preflight");
        // Snapshot the cost ledger while the preflight runs. If reserve() had
        // already happened, a reserved fal.ai row would be present.
        ledgerAtPreflight = [...store.providerCostLedgerEntries.values()].filter(
          (entry) => entry.provider === "fal.ai",
        ).length;
        return fakeResponse();
      },
    });
    const store = new DataStore();
    const { fal, calls } = liveFal(order);
    const cap = new LiveFalSpendCapService(store, { liveRunApproved: "true" });
    const { service } = build({ store, fal, cap, preflight });
    const result = await service.submit(input({ idempotencyKey: "k-order" }));
    expect(result.status).toBe("queued");
    // Preflight ran first, then the provider boundary.
    expect(order).toEqual(["preflight", "fal"]);
    expect(ledgerAtPreflight).toBe(0);
    expect(calls()).toBe(1);
    // And the reservation does exist after the boundary (spend is reserved post-preflight).
    expect([...cap.reservations()]).toHaveLength(1);
  });

  it("fails closed on an unreachable callback URL: no fal request, no spend reserved, names the URL", async () => {
    const { fal, calls } = liveFal();
    const preflight = new CallbackReachabilityPreflight({
      callbackBaseUrl: ORIGIN,
      fetchImpl: async () => {
        throw new Error("NetworkError: DNS lookup failed");
      },
    });
    const store = new DataStore();
    const cap = new LiveFalSpendCapService(store, { liveRunApproved: "true" });
    const { service } = build({ store, fal, cap, preflight });
    await expect(
      service.submit(input({ idempotencyKey: "k-unreachable" })),
    ).rejects.toBeInstanceOf(CallbackUnreachableError);
    await expect(
      service.submit(input({ idempotencyKey: "k-unreachable" })),
    ).rejects.toThrow(/unreachable/);
    await expect(
      service.submit(input({ idempotencyKey: "k-unreachable" })),
    ).rejects.toThrow(/lullabook\.vercel\.app\/api\/webhooks\/fal/);
    expect(calls()).toBe(0); // no fal.ai request was sent
    expect([...cap.reservations()]).toHaveLength(0); // nothing reserved
  });

  it("a live failed preflight leaves the fal.ai spend ledger entirely untouched", async () => {
    const { fal, calls } = liveFal();
    const preflight = new CallbackReachabilityPreflight({
      callbackBaseUrl: ORIGIN,
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const store = new DataStore();
    const cap = new LiveFalSpendCapService(store, { liveRunApproved: "true" });
    // Cross a durable SupabaseDataStore to prove nothing durable was written.
    const tables: Record<string, Record<string, unknown>[]> = {
      families: [{ id: "family-1", created_at: "2026-08-06T00:00:00Z" }],
      provider_cost_ledger: [],
    };
    const durable = new SupabaseDataStore(durableClient(tables) as SupabaseClient);
    await durable.hydrateFamily("family-1");
    const { service } = build({ store: durable, fal, cap, preflight });
    await expect(service.submit(input({ idempotencyKey: "k-durable-fail" })))
      .rejects.toThrow(/unreachable/);
    expect(calls()).toBe(0);
    expect([...durable.providerCostLedgerEntries.values()]).toHaveLength(0);
    expect(tables["provider_cost_ledger"]).toHaveLength(0);
  });
});

describe("203 — live submission fails closed on a missing callback origin", () => {
  afterEach(() => {
    delete (process.env as Record<string, string>)[CALLBACK_ORIGIN_ENV];
  });

  it("rejects a live fal submission when NEXT_PUBLIC_APP_URL is unset: no fal call, no spend reserved", async () => {
    delete (process.env as Record<string, string>)[CALLBACK_ORIGIN_ENV];
    // Cross a durable SupabaseDataStore to prove a live run with no origin
    // writes nothing — no reservation flush reaches durable storage.
    const tables: Record<string, Record<string, unknown>[]> = {
      families: [{ id: "family-1", created_at: "2026-08-06T00:00:00Z" }],
      provider_cost_ledger: [],
    };
    const durable = new SupabaseDataStore(durableClient(tables) as SupabaseClient);
    await durable.hydrateFamily("family-1");
    const { fal, calls } = liveFal();
    const cap = new LiveFalSpendCapService(durable, { liveRunApproved: "true" });
    const { service } = build({ store: durable, fal, cap });
    await expect(service.submit(input({ idempotencyKey: "k-missing-origin" })))
      .rejects.toBeInstanceOf(CallbackOriginConfigError);
    await expect(service.submit(input({ idempotencyKey: "k-missing-origin" })))
      .rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(calls()).toBe(0); // no fal.ai request was sent
    expect([...cap.reservations()]).toHaveLength(0); // nothing reserved
    expect([...durable.providerCostLedgerEntries.values()]).toHaveLength(0);
    expect(tables["provider_cost_ledger"]).toHaveLength(0); // nothing durable
  });

  it("dev-only path stays lenient when the origin is unset", async () => {
    delete (process.env as Record<string, string>)[CALLBACK_ORIGIN_ENV];
    const store = new DataStore();
    const devFal: FalAdapter = {
      isDevOnly: true,
      async startTraining() {
        return { jobId: "job-dev", status: "queued" };
      },
      async submitTraining() {
        return { jobId: "job-dev", status: "queued" };
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
    const { service } = build({ store, fal: devFal });
    const result = await service.submit(input({ idempotencyKey: "k-dev" }));
    expect(result.status).toBe("queued");
  });
});

describe("203 — callback origin is configuration, fail-closed on missing", () => {
  afterEach(() => {
    delete (process.env as Record<string, string>)[CALLBACK_ORIGIN_ENV];
  });

  it("reads the origin from configuration and derives the callback endpoint (never hardcoded)", () => {
    (process.env as Record<string, string>)[CALLBACK_ORIGIN_ENV] = ORIGIN;
    expect(resolveCallbackOrigin()).toBe(ORIGIN);
    expect(callbackEndpointUrl(ORIGIN)).toBe(`${ORIGIN}/api/webhooks/fal`);
  });

  it("fails closed at startup: a missing origin throws, with no localhost fallback", () => {
    delete (process.env as Record<string, string>)[CALLBACK_ORIGIN_ENV];
    expect(resolveCallbackOrigin).toThrow(CallbackOriginConfigError);
    expect(assertCallbackOriginConfigured).toThrow(CallbackOriginConfigError);
    // The error never names a silent localhost default — it fails closed.
    expect(() => assertCallbackOriginConfigured()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("normalizes the origin before deriving the endpoint", () => {
    expect(callbackEndpointUrl("https://lullabook.vercel.app/")).toBe(`${ORIGIN}/api/webhooks/fal`);
  });

  it("a malformed configured origin fails closed as a config error", () => {
    expect(() => callbackEndpointUrl("not a url")).toThrow(CallbackOriginConfigError);
  });
});

describe("203 — SEC-1: provider keys never client-visible", () => {
  it("no NEXT_PUBLIC_* variable names FAL_API_KEY or ANTHROPIC_API_KEY anywhere in src", () => {
    const violators = walkSourceFiles((content, rel) =>
      /NEXT_PUBLIC_[A-Z0-9_]*(FAL_API_KEY|ANTHROPIC_API_KEY)/i.test(content)
        ? `NEXT_PUBLIC secret in ${rel}`
        : "",
    );
    expect(violators).toEqual([]);
  });

  it(".env.example never assigns a NEXT_PUBLIC_* secret and keeps provider keys server-side", () => {
    const example = readFileSync(join(REPO_ROOT, ".env.example"), "utf-8");
    for (const line of example.split("\n")) {
      const trimmed = line.trim();
      if (/^NEXT_PUBLIC_FAL|^NEXT_PUBLIC_ANTHROPIC/i.test(trimmed)) {
        throw new Error(`NEXT_PUBLIC provider key in .env.example: ${trimmed}`);
      }
    }
    // The keys are documented in the server-side block (env.example), never as NEXT_PUBLIC_.
    expect(/NEXT_PUBLIC_FAL/.test(example)).toBe(false);
    expect(/NEXT_PUBLIC_ANTHROPIC/.test(example)).toBe(false);
    expect(example).toMatch(/^FAL_API_KEY=/m);
    expect(example).toMatch(/^ANTHROPIC_API_KEY=/m);
  });

  it("training-path API sources never place provider key strings into response bodies", () => {
    const rels = [
      "src/app/api/personas/[id]/retrain/route.ts",
      "src/app/api/webhooks/fal/route.ts",
      "src/app/api/webhooks/fal/handler.ts",
      "src/services/fal-lora-training.ts",
    ];
    for (const rel of rels) {
      let content: string;
      try {
        content = readFileSync(join(REPO_ROOT, rel), "utf-8");
      } catch {
        continue;
      }
      // A response body must not echo the provider key names. Assert no literal
      // key identifier is returned/assigned into a response.
      expect(content, `${rel} should never expose provider keys`).not.toMatch(
        /FAL_API_KEY|ANTHROPIC_API_KEY/,
      );
    }
  });
});

describe("203 — deployed origin recorded", () => {
  it("PRD v23 records a `Deployed callback origin` heading with the current state", () => {
    const prd = readFileSync(
      join(REPO_ROOT, "CONTEXT/planning/prd-v23-full-likeness-demo.md"),
      "utf-8",
    );
    expect(prd).toMatch(/## Deployed callback origin/);
    // Honesty criterion: the recorded state names the current (localhost) value
    // and that no public origin exists yet.
    expect(prd).toMatch(/Deployed callback origin/i);
    expect(prd).toMatch(/localhost/i);
    expect(prd).toMatch(/vercel/i);
  });
});

// ---- deterministic helpers ----

const REPO_ROOT = process.cwd();

function walkSourceFiles(emit: (content: string, relative: string) => string): string[] {
  const findings: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|js|mjs|mts)$/.test(entry)) {
        const content = readFileSync(full, "utf-8");
        const rel = full.replace(REPO_ROOT + "/", "");
        const finding = emit(content, rel);
        if (finding) findings.push(finding);
      }
    }
  };
  walk(join(REPO_ROOT, "src"));
  return findings;
}

function durableClient(tables: Record<string, Record<string, unknown>[]>): unknown {
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
  return { from: (table: string) => query(table) };
}
