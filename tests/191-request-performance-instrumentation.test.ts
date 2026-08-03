/**
 * Issue 191 — Instrument request, database-wave, and native startup
 * performance (PRD v22 / local ticket 191).
 *
 * Deterministic only: no wall-clock asserts against spec thresholds (the
 * baseline checker validates recorded numbers instead). Every acceptance
 * criterion from the ticket has a named test below.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Test doubles: a stub Supabase service client (select/eq/in/maybeSingle —
// the ops hydration uses) and a fake JWT verifier. The REAL
// createRequestContext runs against the stub, so query counting flows through
// the production seam (vi.mock factories are hoisted → vi.hoisted data).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const stub = vi.hoisted(() => {
  const MEMBER_ROW: Row = {
    id: "mem-1",
    family_id: "fam-1",
    auth_user_id: "auth-1",
    role: "guardian",
    email: "guardian@example.com",
    jurisdiction: "US",
    created_at: new Date().toISOString(),
  };

  function stubClient(tables: Record<string, Row[]>) {
    function makeQuery(table: string) {
      const filters: { kind: "eq" | "in"; column: string; value: unknown }[] = [];
      let single = false;
      const query = {
        select() {
          return this;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return this;
        },
        in(column: string, value: unknown[]) {
          filters.push({ kind: "in", column, value });
          return this;
        },
        maybeSingle() {
          single = true;
          return this;
        },
        then(
          onFulfilled?: (v: { data: unknown; error: null }) => unknown,
          onRejected?: (e: unknown) => unknown
        ) {
          let rows = tables[table] ?? [];
          for (const f of filters) {
            if (f.kind === "eq") rows = rows.filter((r) => r[f.column] === f.value);
            if (f.kind === "in")
              rows = rows.filter((r) => (f.value as unknown[]).includes(r[f.column]));
          }
          const data = single ? (rows[0] ?? null) : rows;
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return query;
    }
    return {
      from: (table: string) => makeQuery(table),
    } as unknown as SupabaseClient;
  }

  return {
    MEMBER_ROW,
    stubClient,
  };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () =>
    stub.stubClient({
      members: [stub.MEMBER_ROW],
      families: [{ id: "fam-1", created_at: new Date().toISOString() }],
    }),
  createAuthClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => null,
    },
  }),
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async (token: string) => {
      if (token === "bad") throw new Error("invalid token");
      return { sub: "auth-1", email: "guardian@example.com", jurisdiction: "US" };
    },
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { RequestRecorder, instrumentClient } from "@/lib/request-timing";
import { withBearerAuth, jsonOk } from "@/lib/api-route";
import { createRequestContext } from "@/lib/context";
import { resolveRequestAuth } from "@/lib/request-auth";
import { scrubObject } from "@/lib/sentry-scrub";
import {
  recordStartup,
  getStartupMilestones,
  startupTimingEnabled,
} from "../mobile/lib/startup-timing";
import { checkBaseline, GATES, percentile } from "../scripts/check-perf-baseline";
import baseline from "../perf-baseline.json";

function bearerRequest(token = "good"): Request {
  return new Request("http://localhost/api/storybooks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function parseServerTiming(header: string | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const entry of (header ?? "").split(", ")) {
    const [name, ...params] = entry.split(";");
    out.set(name, params);
  }
  return out;
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("191 — Server-Timing on authenticated API responses", () => {
  it("acceptance: authenticated API responses expose Server-Timing for auth, hydrate, and total duration", async () => {
    const res = await withBearerAuth(bearerRequest(), async (ctx, member) => {
      expect(member.id).toBe("mem-1");
      return jsonOk({ ok: true });
    });

    const entries = parseServerTiming(res.headers.get("Server-Timing"));
    expect(entries.has("auth")).toBe(true);
    expect(entries.has("hydrate")).toBe(true);
    expect(entries.has("total")).toBe(true);

    const dur = (params: string[]) =>
      Number(params.find((p) => p.startsWith("dur="))!.slice("dur=".length));
    expect(dur(entries.get("auth")!)).toBeGreaterThanOrEqual(0);
    expect(dur(entries.get("hydrate")!)).toBeGreaterThanOrEqual(0);
    expect(dur(entries.get("total")!)).toBeGreaterThanOrEqual(dur(entries.get("hydrate")!));
  });

  it("acceptance: Server-Timing carries Supabase query count and sequential-wave count", async () => {
    const res = await withBearerAuth(bearerRequest(), async () => jsonOk({ ok: true }));

    const entries = parseServerTiming(res.headers.get("Server-Timing"));
    const db = entries.get("db");
    expect(db).toBeTruthy();
    const queries = Number(db!.find((p) => p.startsWith("queries="))!.slice("queries=".length));
    const waves = Number(db!.find((p) => p.startsWith("waves="))!.slice("waves=".length));
    // Hydration = 1 member lookup + 24-table parallel fan-out; every query is
    // counted through the client wrapper at the production seam.
    expect(queries).toBeGreaterThanOrEqual(20);
    expect(waves).toBeGreaterThanOrEqual(1);
    expect(waves).toBeLessThan(queries);
  });
});

describe("191 — request context query + wave recording", () => {
  it("acceptance: the request context records Supabase query count and sequential-wave count", async () => {
    const ctx = createRequestContext();
    expect(ctx.timing.queryCount).toBe(0);
    expect(ctx.timing.waveCount).toBe(0);

    const member = await ctx.store.hydrateByAuthUser("auth-1");
    expect(member?.id).toBe("mem-1");
    expect(ctx.timing.queryCount).toBeGreaterThanOrEqual(20);
    // Sequential-wave structure of hydration: members lookup, the 24-table
    // Promise.all fan-out, then a trailing push_subscriptions read — each
    // batch is one wave, never more than the query count.
    expect(ctx.timing.waveCount).toBeGreaterThanOrEqual(2);
    expect(ctx.timing.waveCount).toBeLessThanOrEqual(ctx.timing.queryCount);
  });

  it("counts a parallel batch as one sequential wave and back-to-back awaits as two", async () => {
    type Thenable = {
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise<unknown>;
    };
    const make = () => {
      let release!: (v: unknown) => void;
      const gate = new Promise<unknown>((res) => (release = res));
      return {
        thenable: { then: (onF: (v: unknown) => unknown) => gate.then(onF) } as Thenable,
        release,
      };
    };

    // Parallel: both queries issued while the first is still in flight → one wave.
    const rec = new RequestRecorder();
    const a = make();
    const b = make();
    const wrapped = instrumentClient(
      { from: (t: string) => (t === "x" ? a.thenable : b.thenable) } as {
        from: (t: string) => Thenable;
      },
      rec
    );
    const p1 = wrapped.from("x").then((v) => v);
    const p2 = wrapped.from("y").then((v) => v);
    expect(rec.queryCount).toBe(2);
    expect(rec.waveCount).toBe(1); // both started with in-flight > 0
    a.release({ data: null, error: null });
    b.release({ data: null, error: null });
    await Promise.all([p1, p2]);
    expect(rec.queryCount).toBe(2);
    expect(rec.waveCount).toBe(1);

    // Sequential: the second query starts only after the first settled → two waves.
    const rec2 = new RequestRecorder();
    const c = make();
    const d = make();
    const wrapped2 = instrumentClient(
      { from: (t: string) => (t === "c" ? c.thenable : d.thenable) } as {
        from: (t: string) => Thenable;
      },
      rec2
    );
    const r1 = wrapped2.from("c").then((v) => v);
    c.release({ data: null, error: null });
    await r1;
    const r2 = wrapped2.from("d").then((v) => v);
    expect(rec2.waveCount).toBe(2);
    d.release({ data: null, error: null });
    await r2;
    expect(rec2.queryCount).toBe(2);
  });

  it("the wrapped client preserves the query result exactly (no data transformation)", async () => {
    const done = Promise.resolve({ data: { id: "x" }, error: null });
    const rec = new RequestRecorder();
    const wrapped = instrumentClient(
      { from: (_t: string) => ({ then: (onF: (v: unknown) => unknown) => done.then(onF) }) } as {
        from: (t: string) => PromiseLike<{ data: { id: string }; error: null }>;
      },
      rec
    );
    const result = await (wrapped.from("t") as unknown as Promise<{ data: { id: string }; error: null }>);
    expect(result).toEqual({ data: { id: "x" }, error: null });
  });

  it("does not add a proxy when a client has no query execution seam", () => {
    const client = { healthcheck: () => "ok" };
    expect(instrumentClient(client, new RequestRecorder())).toBe(client);
  });

  it("counts RPC round-trips and recovers wave state when a thenable throws synchronously", async () => {
    const recorder = new RequestRecorder();
    const wrapped = instrumentClient(
      {
        rpc: async () => ({ data: null, error: null }),
        from: () => ({
          then() {
            throw new Error("query failed");
          },
        }),
      },
      recorder
    ) as unknown as {
      rpc: () => Promise<{ data: null; error: null }>;
      from: (table: string) => { then: () => never };
    };

    await wrapped.rpc();
    expect(recorder.queryCount).toBe(1);
    expect(recorder.waveCount).toBe(1);

    expect(() => wrapped.from("broken").then()).toThrow("query failed");
    // A synchronous provider failure must settle the recorder; otherwise every
    // later query is incorrectly folded into the stranded first wave.
    await wrapped.rpc();
    expect(recorder.queryCount).toBe(3);
    expect(recorder.waveCount).toBe(3);
  });

  it("keeps Server-Timing and breadcrumb serialization finite for adversarial durations", () => {
    const recorder = new RequestRecorder();
    recorder.markMs("auth", Number.NaN);
    recorder.markMs("hydrate", Number.POSITIVE_INFINITY);
    recorder.markMs("total", -10);

    const header = recorder.toServerTiming();
    expect(header).not.toMatch(/NaN|Infinity/);
    expect(header).toMatch(
      /^auth;dur=\d+(\.\d+)?, hydrate;dur=\d+(\.\d+)?, total;dur=\d+(\.\d+)?, db;queries=0;waves=0$/
    );
    expect(Object.values(recorder.toJSON()).every(Number.isFinite)).toBe(true);
  });
});

describe("191 — request auth timing (native bearer path)", () => {
  it("records auth, hydrate, and total marks for bearer-authenticated requests", async () => {
    const authed = await resolveRequestAuth(bearerRequest());
    expect(authed).not.toBeNull();
    const marks = authed!.ctx.timing.marksSnapshot;
    expect(marks["auth"]).toBeGreaterThanOrEqual(0);
    expect(marks["hydrate"]).toBeGreaterThanOrEqual(0);
    expect(marks["total"]).toBeGreaterThanOrEqual(0);
    expect(marks["total"]).toBeGreaterThanOrEqual(marks["hydrate"]!);
  });
});

describe("191 — native startup timing (dev-only breadcrumb)", () => {
  it("acceptance: native startup records process-start → interactive and first-read milestones in development only", () => {
    // NODE_ENV=test is a non-production env → recording active (same as __DEV__).
    expect(startupTimingEnabled(undefined, "test")).toBe(true);
    expect(startupTimingEnabled(undefined, "production")).toBe(false);
    expect(startupTimingEnabled(undefined, "")).toBe(false);
    expect(startupTimingEnabled(true, "production")).toBe(true);

    recordStartup("process-start");
    recordStartup("interactive");
    recordStartup("first-read");
    recordStartup("process-start");
    recordStartup("email=guardian@example.com");
    const milestones = getStartupMilestones();
    expect(milestones.map((m) => m.name)).toEqual(["process-start", "interactive", "first-read"]);
    for (const m of milestones) {
      expect(typeof m.ms).toBe("number");
      expect(m.ms).toBeGreaterThanOrEqual(0);
      expect(m.name).toMatch(/^[a-z][a-z0-9-]*$/);
    }

    const snapshot = [...milestones];
    snapshot.pop();
    expect(getStartupMilestones()).toHaveLength(3);
  });
});

describe("191 — no secrets, <10ms happy path", () => {
  it("acceptance: instrumentation logs no token, email, photo key, provider URL, prompt, or credential", async () => {
    const res = await withBearerAuth(bearerRequest(), async (ctx) => {
      ctx.timing.mark("handler-done");
      return jsonOk({ ok: true });
    });
    const header = res.headers.get("Server-Timing")!;

    // Header must be pure `name;param=number` tokens — numbers only, no free text.
    for (const entry of header.split(", ")) {
      expect(entry).toMatch(
        /^[a-z][a-z0-9-]*((;[a-z][a-z0-9-]*=\d+(\.\d+)?)(;[a-z][a-z0-9-]*=\d+)*)?$/
      );
    }
    // Nothing sensitive can appear: no emails, URLs, tokens, keys, prompts.
    expect(header).not.toMatch(/@/);
    expect(header).not.toMatch(/http/i);
    expect(header).not.toMatch(/bearer|jwt|authorization/i);
    expect(header).not.toMatch(/token|email|photo|prompt|credential|secret/i);
    expect(header).not.toMatch(/sk-|key=/);

    // The recorder's serialized state is numbers-only → provably no string data.
    const json = new RequestRecorder().toJSON();
    for (const [k, v] of Object.entries(json)) {
      expect(typeof v).toBe("number");
      expect(k).toMatch(/^[A-Za-z][A-Za-z0-9]*$/); // fixed literal keys, never user data
    }
    // Double-check with the production scrubber: never throws on this payload.
    expect(scrubObject(json)).not.toBe("[scrub-error]");
  });

  it("acceptance: instrumentation adds well under 10ms to the happy path (sync, no I/O, no awaits)", () => {
    // Structural proof: every recorder method is synchronous and does no I/O.
    const rec = new RequestRecorder();
    expect(rec.queryStarted()).toBeUndefined();
    expect(rec.querySettled()).toBeUndefined();
    expect(rec.mark("x")).toBeUndefined();
    expect(rec.markMs("y", 1.5)).toBeUndefined();

    // Sanity bound (not a spec assert): 600k bookkeeping ops must finish in a
    // fraction of a second — a regression that adds logging/disk I/O or a
    // network hop per query blows this by orders of magnitude.
    const t0 = performance.now();
    for (let i = 0; i < 200_000; i++) {
      rec.queryStarted();
      rec.querySettled();
      rec.mark("m");
    }
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("191 — middleware session-refresh timing", () => {
  it("instruments the Supabase session refresh with a Server-Timing header", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");
    const res = await middleware(new NextRequest("https://localhost/storybooks"));
    expect(res.headers.get("Server-Timing")).toMatch(/^session-refresh;dur=\d+(\.\d+)?$/);
  });

  it("is a no-op (no timing header) when Supabase env is absent", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");
    const res = await middleware(new NextRequest("https://localhost/x"));
    expect(res.headers.get("Server-Timing")).toBeNull();
  });
});

describe("191 — checked-in performance baseline", () => {
  it("acceptance: the baseline uses a named device/build profile and ≥20 samples per measured path", () => {
    expect(baseline.profile.name.length).toBeGreaterThan(0);
    expect(baseline.profile.method.length).toBeGreaterThan(0);
    for (const rec of Object.values(baseline.paths)) {
      expect(rec.samples.length).toBeGreaterThanOrEqual(20);
      expect(rec.samples.every((s) => typeof s === "number" && s > 0)).toBe(true);
    }
  });

  it("acceptance: the baseline records timing method, fixture size, sample count, and PASS/FAIL for cold start, create response, Home, Story list, and Story detail", () => {
    for (const name of [
      "cold-start",
      "create-response",
      "home",
      "story-list",
      "story-detail",
    ] as const) {
      const rec = baseline.paths[name];
      expect(rec, `missing baseline path ${name}`).toBeTruthy();
      expect(rec.method.length).toBeGreaterThan(0);
      expect(rec.fixtureSize.length).toBeGreaterThan(0);
      expect(rec.samples.length).toBeGreaterThanOrEqual(20);
      expect(rec.sampleCount).toBe(rec.samples.length);
      expect(rec.result).toBe("PASS");
    }
  });

  it("acceptance: the baseline checker fails unless cold start p95 <3s, create <2s, story text <25s, 12-page <90s, page turn <100ms, story detail <500KB", () => {
    const results = checkBaseline(baseline);
    const byPath = new Map(results.map((r) => [r.path, r]));
    for (const r of results) {
      expect(r.pass, `baseline gate failed: ${r.path} p95=${r.p95} limit=${r.limit}`).toBe(true);
    }
    // Named gates, exactly as the ticket states.
    expect(byPath.get("cold-start")!.limit).toBe(3000);
    expect(byPath.get("create-response")!.limit).toBe(2000);
    expect(byPath.get("story-text")!.limit).toBe(25000);
    expect(byPath.get("12-page-generation")!.limit).toBe(90000);
    expect(byPath.get("page-turn")!.limit).toBe(100);
    expect(byPath.get("story-detail")!.limit).toBe(512000);
  });

  it("the checker FAILS when a recorded threshold is missed (failing-checker proof)", () => {
    // 19 of 20 samples above the 3000ms cold-start threshold → p95 ≥ 3000.
    const tampered = structuredClone(baseline);
    tampered.paths["cold-start"].samples = [1000, ...new Array(19).fill(5000)];
    const results = checkBaseline(tampered);
    const coldStart = results.find((r) => r.path === "cold-start")!;
    expect(coldStart.pass).toBe(false);
    expect(
      percentile([...tampered.paths["cold-start"].samples].sort((a, b) => a - b), 95)
    ).toBeGreaterThanOrEqual(3000);
    // Every other gate stays green — a threshold miss is a per-path failure.
    expect(results.filter((r) => !r.pass).map((r) => r.path)).toEqual(["cold-start"]);
  });

  it("fails closed for missing/invalid profiles and malformed sample records", () => {
    const missing = checkBaseline({} as typeof baseline);
    expect(missing.map((r) => r.path)).toEqual(Object.keys(GATES));
    expect(missing.every((r) => !r.pass)).toBe(true);

    const invalidProfile = structuredClone(baseline);
    invalidProfile.profile.name = "";
    invalidProfile.profile.method = "";
    expect(checkBaseline(invalidProfile).every((r) => !r.pass)).toBe(true);

    const invalidSamples = structuredClone(baseline);
    invalidSamples.paths["story-text"].samples[0] = Number.NaN;
    invalidSamples.paths["story-text"].sampleCount = 19;
    invalidSamples.paths["story-text"].result = "FAIL";
    expect(checkBaseline(invalidSamples).find((r) => r.path === "story-text")!.pass).toBe(false);

    const missingRecordedPath = structuredClone(baseline);
    delete (missingRecordedPath.paths as Record<string, unknown>)["home"];
    expect(checkBaseline(missingRecordedPath).every((r) => !r.pass)).toBe(true);
  });

  it("returns a finite nearest-rank result for an invalid percentile request", () => {
    expect(percentile([100, 200], Number.NaN)).toBe(100);
    expect(percentile([], 95)).toBe(0);
  });
});
