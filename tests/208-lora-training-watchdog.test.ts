import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import { RealFalAdapter } from "@/adapters/fal";
import type {
  FalAdapter,
  FalTrainingRequestRecord,
  FalTrainingStatusQuery,
  FalTrainingStatusResult,
} from "@/adapters/types";
import { DataStore } from "@/db/store";
import {
  DataStoreFalTrainingLifecycleRepository,
  type FalTrainingCallbackClaim,
  type FalTrainingCallbackCompletion,
  type FalTrainingInFlightQuery,
  type FalTrainingLifecycleRepository,
} from "@/db/fal-training-lifecycle";
import type { Persona } from "@/domain/types";
import { CallbackReachabilityPreflight } from "@/services/callback-reachability";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import {
  createFalTrainingWatchdog,
  FAL_TRAINING_BUDGET_MS,
  FalTrainingWatchdogService,
  falAdapterStatusFetcher,
  type FalTrainingWatchdogOutcome,
} from "@/services/fal-training-watchdog";
import {
  LiveFalSpendCapBlockedError,
  LiveFalSpendCapService,
  type LiveFalSpendCheckpoint,
} from "@/services/live-fal-spend-cap";
import {
  LIVE_LORA_RUN_PERSONA_IDS_ENV,
  planLiveLoraTrainingRun,
} from "@/services/live-lora-training-run";
import { LIVE_FAL_RUN_APPROVED_ENV } from "@/services/fal-jwks";
import { FLUX_2_TRAINER_ENDPOINT } from "@/services/provider-bakeoff";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";

/**
 * Ticket 208 (issue 219) — five real fal.ai LoRA trainings with watchdog
 * reconciliation, deterministic half.
 *
 * The live run itself is NOT run here: without `LIVE_PROVIDER_RUN_APPROVED`
 * there is no approval, no real consented photos, and the $20 cap is
 * fail-closed, so the live report honestly reads BLOCKED (COST-2). What is
 * proven here is the machinery that makes that live run survivable:
 *
 *  - FAIL-4 — a training whose callback never arrives is FOUND (repository
 *    in-flight seam), POLLED (fal queue status seam), and driven to the
 *    terminal status fal reports, including a redacted failure;
 *  - LAT-5 — every training reaches a terminal state inside a 25 minute
 *    injected-clock budget with a visible, bounded progress state;
 *  - FAIL-3 — failures are durable `failed` Personas with redacted reasons, no
 *    orphaned owned blob, no double spend, and a retry that cannot double-bill;
 *  - COST-1 — the watchdog is read-only against the provider, so it can neither
 *    bypass nor release the $20 cap;
 *  - and the watchdog never double-advances a request a callback already
 *    terminalized (stale/duplicate-safe).
 *
 * Every provider boundary is a fake: no network, no spend.
 */

const flux2 = { endpoint: FLUX_2_TRAINER_ENDPOINT, model: "flux-2-lora-v2", steps: 300 };
const ORIGIN = "https://lullabook.vercel.app";
const BASE_TIME = new Date("2026-08-06T00:00:00Z");
const MINUTE = 60_000;
const STATUS_URL = "https://queue.fal.run/fal-ai/flux-2-trainer-v2/requests/job-1/status";
/** Each 300-step training estimates at 300 * $0.0008. */
const TRAINING_COST_USD = 0.24;

type PolledStatus = FalTrainingStatusResult | (() => FalTrainingStatusResult | never);

interface Harness {
  store: DataStore;
  blobs: InMemoryBlobStore;
  cap: LiveFalSpendCapService;
  checkpoints: LiveFalSpendCheckpoint[];
  train: FalLoraTrainingService;
  watchdog: FalTrainingWatchdogService;
  repository: FalTrainingLifecycleRepository;
  clock: () => Date;
  advance(ms: number): void;
  setStatus(status: PolledStatus): void;
  polls: FalTrainingStatusQuery[];
  submitCalls: () => number;
  downloads: () => string[];
  seedPersona(id: string): Persona;
  submit(personaId: string, idempotencyKey: string): Promise<{ requestId: string }>;
  falLedger(): { outcome: string; estimatedCostUsd: number; requestId: string }[];
}

function setup(
  options: {
    capUsd?: number;
    warningAtUsd?: number;
    budgetMs?: number;
    pollAfterMs?: number;
    repository?: (base: FalTrainingLifecycleRepository) => FalTrainingLifecycleRepository;
    badArtifacts?: boolean;
  } = {},
): Harness {
  const store = new DataStore();
  const blobs = new InMemoryBlobStore();
  let now = new Date(BASE_TIME);
  const clock = () => new Date(now);
  const checkpoints: LiveFalSpendCheckpoint[] = [];
  const polls: FalTrainingStatusQuery[] = [];
  const downloaded: string[] = [];
  let submits = 0;
  let polled: PolledStatus = { requestId: "job-1", status: "IN_PROGRESS" };

  const fal: FalAdapter = {
    isDevOnly: false,
    async startTraining() {
      submits++;
      return { jobId: `job-${submits}`, status: "queued" };
    },
    async submitTraining() {
      submits++;
      // The real adapter retains fal's queue status_url; so does this fake.
      return {
        jobId: `job-${submits}`,
        status: "queued",
        statusUrl: `https://queue.fal.run/${flux2.endpoint}/requests/job-${submits}/status`,
      };
    },
    async fetchTrainingStatus(query) {
      polls.push(query);
      const value = typeof polled === "function" ? polled() : polled;
      return { ...value, requestId: query.requestId };
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

  const cap = new LiveFalSpendCapService(
    store,
    { liveRunApproved: "true", capUsd: options.capUsd, warningAtUsd: options.warningAtUsd },
    (checkpoint) => checkpoints.push(checkpoint),
  );
  const train = new FalLoraTrainingService(
    store,
    fal,
    blobs,
    flux2,
    clock,
    undefined,
    cap,
    new CallbackReachabilityPreflight({
      callbackBaseUrl: ORIGIN,
      fetchImpl: async () => new Response("ok", { status: 200 }),
    }),
  );

  const base: FalTrainingLifecycleRepository = new DataStoreFalTrainingLifecycleRepository(store, clock);
  const repository = options.repository ? options.repository(base) : base;
  const download = async (url: string) => {
    downloaded.push(url);
    if (options.badArtifacts) {
      return url.includes("config")
        ? { bytes: Buffer.from("not-json"), contentType: "application/json", finalUrl: url }
        : { bytes: Buffer.alloc(4), contentType: "application/octet-stream", finalUrl: url };
    }
    return url.includes("config")
      ? {
          bytes: Buffer.from(JSON.stringify({ architecture: flux2.model })),
          contentType: "application/json",
          finalUrl: url,
        }
      : {
          bytes: makeTestSafetensorsArtifact({ model: flux2.model }),
          contentType: "application/octet-stream",
          finalUrl: url,
        };
  };
  const watchdog = new FalTrainingWatchdogService(
    repository,
    blobs,
    falAdapterStatusFetcher(fal),
    download,
    clock,
    { budgetMs: options.budgetMs, pollAfterMs: options.pollAfterMs ?? MINUTE },
  );

  return {
    store,
    blobs,
    cap,
    checkpoints,
    train,
    watchdog,
    repository,
    clock,
    advance(ms) {
      now = new Date(now.getTime() + ms);
    },
    setStatus(status) {
      polled = status;
    },
    polls,
    submitCalls: () => submits,
    downloads: () => [...downloaded],
    seedPersona(id) {
      const persona: Persona = {
        id,
        familyId: "family-1",
        createdByMemberId: "member-1",
        kind: "baby",
        displayName: "Maya",
        status: "training",
        loraWeightKey: null,
        avatarKey: null,
        reviewSampleKeys: [],
        likenessConfirmed: false,
        createdAt: new Date(BASE_TIME),
      };
      store.personas.set(id, persona);
      return persona;
    },
    async submit(personaId, idempotencyKey) {
      return train.submit({
        familyId: "family-1",
        personaId,
        images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
        defaultCaption: "a portrait of subject",
        idempotencyKey,
      });
    },
    falLedger() {
      return [...store.providerCostLedgerEntries.values()]
        .filter((entry) => entry.provider === "fal.ai")
        .map((entry) => ({
          outcome: entry.outcome,
          estimatedCostUsd: entry.estimatedCostUsd,
          requestId: entry.requestId,
        }));
    },
  };
}

function readyStatus(requestId: string): FalTrainingStatusResult {
  return {
    requestId,
    status: "OK",
    payload: {
      diffusers_lora_file: {
        url: "https://fal.media/files/weights.safetensors",
        content_type: "application/octet-stream",
      },
      config_file: { url: "https://fal.media/files/config.json", content_type: "application/json" },
    },
  };
}

/** A training submitted, then left silent past the watchdog's poll window. */
async function submitAndGoSilent(h: Harness, personaId = "persona-1", key = "train/family-1/persona-1/v1") {
  h.seedPersona(personaId);
  const submitted = await h.submit(personaId, key);
  return submitted.requestId;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("208 — FAIL-4: a training whose callback never arrives is reconciled by polling fal", () => {
  it("finds the stale request, polls the RETAINED fal status URL, and advances it to ready", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    // The submit response's status_url is retained on the record — the watchdog
    // polls the exact queue entry fal created rather than guessing one.
    expect(h.store.falTrainingRequests.get(requestId)!.statusUrl).toBe(STATUS_URL);

    h.setStatus(readyStatus(requestId));
    h.advance(10 * MINUTE); // callback never arrived

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ requestId, action: "advanced_ready", status: "ready" });
    expect(h.polls).toEqual([
      { requestId, endpoint: flux2.endpoint, statusUrl: STATUS_URL },
    ]);

    const request = h.store.falTrainingRequests.get(requestId)!;
    expect(request.status).toBe("ready");
    expect(request.loraWeightKey).toBe("lora/family-1/persona-1/weights.safetensors");
    expect(request.configurationKey).toBe("lora/family-1/persona-1/config.json");
    // The Persona moved on the SAME terminal transition a signed callback drives.
    expect(h.store.personas.get("persona-1")).toMatchObject({
      status: "review",
      loraWeightKey: "lora/family-1/persona-1/weights.safetensors",
    });
    expect(await h.blobs.list("lora/family-1/persona-1/")).toHaveLength(2);
  });

  it("advances an ERROR status to a durable failed Persona with a redacted reason", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h, "persona-err", "train/family-1/persona-err/v1");
    h.setStatus({
      requestId,
      status: "ERROR",
      error: "fal.ai 500 training crashed api_key=super-secret",
    });
    h.advance(9 * MINUTE);

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ action: "advanced_failed", status: "failed" });

    const persona = h.store.personas.get("persona-err")!;
    expect(persona.status).toBe("failed");
    expect(persona.failureReason).toMatch(/training crashed/);
    expect(JSON.stringify(persona.failureReason)).not.toContain("super-secret");
    expect(JSON.stringify(outcome.error)).not.toContain("super-secret");
    // FAIL-3: no partial Persona surface, no orphaned owned blob.
    expect(persona.loraWeightKey).toBeNull();
    expect(await h.blobs.list("lora/family-1/persona-err/")).toEqual([]);
  });

  it("reconciles when wired straight to the DataStore, not only to a repository", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    const watchdog = new FalTrainingWatchdogService(
      h.store,
      h.blobs,
      async () => readyStatus(requestId),
      async (url) =>
        url.includes("config")
          ? {
              bytes: Buffer.from(JSON.stringify({ architecture: flux2.model })),
              contentType: "application/json",
              finalUrl: url,
            }
          : {
              bytes: makeTestSafetensorsArtifact({ model: flux2.model }),
              contentType: "application/octet-stream",
              finalUrl: url,
            },
      h.clock,
      { pollAfterMs: MINUTE },
    );
    h.advance(8 * MINUTE);
    expect(await watchdog.reconcile()).toMatchObject([{ action: "advanced_ready", status: "ready" }]);
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "review" });
  });

  it("leaves a fresh request alone: nothing is polled inside the silence window", async () => {
    const h = setup({ pollAfterMs: 5 * MINUTE });
    await submitAndGoSilent(h);
    h.advance(MINUTE);
    expect(await h.watchdog.reconcile()).toEqual([]);
    expect(h.polls).toEqual([]);
  });

  it("keeps reconciling later passes when the provider poll itself fails inside the budget", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    h.setStatus(() => {
      throw new Error("fal.ai 503 Service Unavailable token=abcd");
    });
    h.advance(5 * MINUTE);

    const [failedPoll] = await h.watchdog.reconcile();
    expect(failedPoll).toMatchObject({ action: "poll_failed", status: "queued" });
    expect(failedPoll.error).toMatch(/503/);
    // Nothing was advanced and nothing was lost — the request is still in flight.
    expect(h.store.falTrainingRequests.get(requestId)!.status).toBe("queued");
    expect(h.store.personas.get("persona-1")!.status).toBe("training");

    h.setStatus(readyStatus(requestId));
    h.advance(MINUTE);
    const [recovered] = await h.watchdog.reconcile();
    expect(recovered).toMatchObject({ action: "advanced_ready", status: "ready" });
  });
});

describe("208 — LAT-5: every training is terminal within a 25 minute budget, with visible progress", () => {
  it("defaults the training budget to 25 minutes", () => {
    expect(FAL_TRAINING_BUDGET_MS).toBe(25 * MINUTE);
    expect(setup().watchdog.budgetMs()).toBe(25 * MINUTE);
  });

  it("reports bounded progress while training and never an unbounded spinner", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    h.setStatus({ requestId, status: "IN_PROGRESS" });
    h.advance(10 * MINUTE);

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ action: "still_running", status: "running" });
    expect(outcome.progress).toMatchObject({
      requestId,
      personaId: "persona-1",
      elapsedMs: 10 * MINUTE,
      budgetMs: 25 * MINUTE,
      remainingMs: 15 * MINUTE,
      terminal: false,
    });
    expect(outcome.progress.deadlineAt.getTime()).toBe(BASE_TIME.getTime() + 25 * MINUTE);
    // Visible progress is durable, not just a returned object.
    expect(h.store.falTrainingRequests.get(requestId)!.status).toBe("running");
  });

  it("fails a still-running training terminally AT the budget, so nothing waits longer than 25 minutes", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    h.setStatus({ requestId, status: "IN_PROGRESS" });
    h.advance(FAL_TRAINING_BUDGET_MS);

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ action: "expired_failed", status: "failed" });
    expect(outcome.progress).toMatchObject({ terminal: true, remainingMs: 0 });

    const request = h.store.falTrainingRequests.get(requestId)!;
    expect(request.status).toBe("failed");
    expect(request.error).toMatch(/25 minute budget/);
    // The wall-clock bound is real: terminal no later than createdAt + budget.
    expect(request.updatedAt.getTime() - request.createdAt.getTime()).toBeLessThanOrEqual(
      FAL_TRAINING_BUDGET_MS,
    );
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "failed" });
    expect(h.store.personas.get("persona-1")!.failureReason).toMatch(/25 minute budget/);
    // Nothing is left in flight after the pass.
    expect(
      await h.repository.listInFlight({
        idleSince: new Date(BASE_TIME.getTime() + 10 * 60 * MINUTE),
        deadlineBefore: new Date(BASE_TIME.getTime() + 10 * 60 * MINUTE),
      }),
    ).toEqual([]);
  });

  it("holds the budget even when progress heartbeats keep refreshing the idle clock", async () => {
    // Regression: a `still_running` heartbeat advances `updatedAt`, so an
    // idle-only listing would not re-list this request until a whole silence
    // window later — pushing its terminal transition past 25 minutes. The
    // listing's deadline arm must pick it up ON the budget regardless.
    // A silence window (2 min) wider than the reconciliation cadence (1 min)
    // is exactly the case where a refreshed idle clock hides the request.
    const h = setup({ pollAfterMs: 2 * MINUTE });
    const requestId = await submitAndGoSilent(h);
    h.setStatus({ requestId, status: "IN_PROGRESS" });

    const actions: string[] = [];
    for (let minute = 1; minute <= 30; minute += 1) {
      h.advance(MINUTE);
      for (const outcome of await h.watchdog.reconcile()) actions.push(outcome.action);
      const current = h.store.falTrainingRequests.get(requestId)!;
      if (current.status === "failed" || current.status === "ready") break;
    }

    // Heartbeats really did happen (the idle clock was being refreshed).
    expect(actions.filter((action) => action === "still_running").length).toBeGreaterThan(1);
    expect(actions.at(-1)).toBe("expired_failed");

    const request = h.store.falTrainingRequests.get(requestId)!;
    expect(request.status).toBe("failed");
    expect(request.updatedAt.getTime() - request.createdAt.getTime()).toBe(FAL_TRAINING_BUDGET_MS);
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "failed" });
  });

  it("lists a past-deadline request ahead of merely idle ones when a pass is bounded", async () => {
    const h = setup({ pollAfterMs: MINUTE });
    const doomed = await submitAndGoSilent(h);
    // Its deadline passes while five newer trainings queue up behind it.
    h.advance(FAL_TRAINING_BUDGET_MS);
    for (let index = 2; index <= 6; index += 1) {
      h.seedPersona(`persona-${index}`);
      await h.submit(`persona-${index}`, `train/family-1/persona-${index}/v1`);
    }
    h.advance(2 * MINUTE);

    const listed = await h.repository.listInFlight({
      idleSince: new Date(h.clock().getTime() - MINUTE),
      deadlineBefore: new Date(h.clock().getTime() - FAL_TRAINING_BUDGET_MS),
      limit: 1,
    });
    expect(listed.map((request) => request.requestId)).toEqual([doomed]);
  });

  it("terminalizes past the budget even when the provider cannot be reached at all", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    h.setStatus(() => {
      throw new Error("connect ETIMEDOUT queue.fal.run");
    });
    h.advance(FAL_TRAINING_BUDGET_MS + MINUTE);

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ action: "expired_failed", status: "failed" });
    expect(h.store.falTrainingRequests.get(requestId)!.error).toMatch(/poll failed past the training budget/);
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "failed" });
  });

  it("reconciles five silent trainings in one bounded pass", async () => {
    const h = setup({ capUsd: 20 });
    for (let index = 0; index < 5; index++) {
      h.seedPersona(`persona-${index}`);
      await h.submit(`persona-${index}`, `train/family-1/persona-${index}/v1`);
    }
    h.setStatus(() => readyStatus("ignored"));
    h.advance(20 * MINUTE);

    const outcomes = await h.watchdog.reconcile();
    expect(outcomes).toHaveLength(5);
    expect(outcomes.every((outcome: FalTrainingWatchdogOutcome) => outcome.action === "advanced_ready")).toBe(true);
    for (let index = 0; index < 5; index++) {
      expect(h.store.personas.get(`persona-${index}`)).toMatchObject({ status: "review" });
    }
    // Five real trainings, five holds, still under the $20 cap.
    const ledger = h.falLedger();
    expect(ledger).toHaveLength(5);
    expect(ledger.reduce((sum, row) => sum + row.estimatedCostUsd, 0)).toBeCloseTo(5 * TRAINING_COST_USD, 5);
  });
});

describe("208 — FAIL-3: watchdog failures are durable, redacted, and never double-spend", () => {
  it("rejects a malformed artifact into a durable failed Persona with no orphaned owned blob", async () => {
    const h = setup({ badArtifacts: true });
    const requestId = await submitAndGoSilent(h, "persona-mal", "train/family-1/persona-mal/v1");
    h.setStatus(readyStatus(requestId));
    h.advance(8 * MINUTE);

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ action: "advanced_failed", status: "failed" });
    expect(outcome.error).toMatch(/artifact|configuration|truncated|json/i);

    const persona = h.store.personas.get("persona-mal")!;
    expect(persona.status).toBe("failed");
    expect(persona.failureReason).toMatch(/artifact|configuration|truncated|json/i);
    expect(persona.loraWeightKey).toBeNull();
    expect(await h.blobs.list("lora/family-1/persona-mal/")).toEqual([]);
    // One attempt, one settled hold — the failure did not add or refund spend.
    const ledger = h.falLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      outcome: "succeeded",
      requestId: "train/family-1/persona-mal/v1",
    });
    expect(ledger[0]!.estimatedCostUsd).toBeCloseTo(TRAINING_COST_USD, 5);
  });

  it("a retry control replaying the same idempotency key never bills a second training", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    h.setStatus({ requestId, status: "ERROR", error: "fal training failed" });
    h.advance(6 * MINUTE);
    await h.watchdog.reconcile();
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "failed" });

    const submitsBefore = h.submitCalls();
    const replay = await h.submit("persona-1", "train/family-1/persona-1/v1");
    expect(replay.requestId).toBe(requestId);
    expect(h.submitCalls()).toBe(submitsBefore); // no second provider call
    expect(h.falLedger()).toHaveLength(1); // and no second hold

    // A genuinely NEW attempt is a new billable training: exactly one more hold.
    h.seedPersona("persona-1-retry");
    await h.submit("persona-1-retry", "train/family-1/persona-1/v2");
    expect(h.falLedger()).toHaveLength(2);
    expect(h.falLedger().every((row) => row.outcome === "succeeded")).toBe(true);
  });
});

describe("208 — COST-1: the watchdog cannot bypass or release the $20 fail-closed cap", () => {
  it("polls without reserving, settling, or submitting anything", async () => {
    const h = setup();
    const requestId = await submitAndGoSilent(h);
    const ledgerBefore = h.falLedger();
    const submitsBefore = h.submitCalls();

    h.setStatus(readyStatus(requestId));
    h.advance(12 * MINUTE);
    await h.watchdog.reconcile();

    expect(h.falLedger()).toEqual(ledgerBefore); // read-only against spend
    expect(h.submitCalls()).toBe(submitsBefore); // the watchdog never re-submits
    expect(h.checkpoints).toEqual([]); // and emits no spend events of its own
  });

  it("does not free budget by failing a training: the cap still blocks the next attempt", async () => {
    // Cap of $0.4 admits exactly one 300-step training ($0.24).
    const h = setup({ capUsd: 0.4 });
    const requestId = await submitAndGoSilent(h);
    h.setStatus({ requestId, status: "ERROR", error: "fal training failed" });
    h.advance(7 * MINUTE);
    await h.watchdog.reconcile();
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "failed" });

    h.seedPersona("persona-2");
    await expect(h.submit("persona-2", "train/family-1/persona-2/v1")).rejects.toBeInstanceOf(
      LiveFalSpendCapBlockedError,
    );
    expect(h.falLedger()).toHaveLength(1);
  });

  it("halts at the $18 checkpoint and refuses the attempt that would cross $20", async () => {
    const h = setup({ capUsd: 20, warningAtUsd: 18 });
    // 75 trainings * $0.24 = $18.00 exactly — the checkpoint threshold.
    for (let index = 0; index < 75; index++) {
      h.seedPersona(`persona-${index}`);
      await h.submit(`persona-${index}`, `train/family-1/persona-${index}/v1`);
    }
    const checkpoint = h.checkpoints.at(-1)!;
    expect(checkpoint.event).toBe("spend_checkpoint");
    expect(checkpoint.cumulativeReservedUsd).toBeCloseTo(18, 5);
    expect(checkpoint.capUsd).toBe(20);
    expect(checkpoint.remainingBudgetUsd).toBeCloseTo(2, 5);

    // Spend to the ceiling, then the next attempt is refused before the boundary.
    for (let index = 75; index < 83; index++) {
      h.seedPersona(`persona-${index}`);
      await h.submit(`persona-${index}`, `train/family-1/persona-${index}/v1`);
    }
    expect(h.falLedger()).toHaveLength(83); // 83 * 0.24 = 19.92
    h.seedPersona("persona-over");
    await expect(h.submit("persona-over", "train/family-1/persona-over/v1")).rejects.toBeInstanceOf(
      LiveFalSpendCapBlockedError,
    );
    expect(h.falLedger()).toHaveLength(83); // nothing reserved past the cap
  });
});

describe("208 — the watchdog never double-advances a request", () => {
  it("skips a request a callback terminalized between the listing and the claim", async () => {
    // The listing is a snapshot; this repository serves a stale `queued` view
    // while the store has already moved the request to `ready`.
    let stale: FalTrainingRequestRecord[] = [];
    const h = setup({
      repository: (base) => ({
        claimCallback: (requestId, fingerprint, leaseSeconds) =>
          base.claimCallback(requestId, fingerprint, leaseSeconds),
        completeCallback: (completion) => base.completeCallback(completion),
        releaseCallback: (requestId, fingerprint) => base.releaseCallback(requestId, fingerprint),
        listInFlight: async () => stale,
      }),
    });
    const requestId = await submitAndGoSilent(h);
    const snapshot = { ...h.store.falTrainingRequests.get(requestId)! };
    stale = [snapshot];

    // The signed callback wins the race and terminalizes the request.
    const request = h.store.falTrainingRequests.get(requestId)!;
    request.status = "ready";
    request.loraWeightKey = "lora/family-1/persona-1/weights.safetensors";
    request.configurationKey = "lora/family-1/persona-1/config.json";
    const persona = h.store.personas.get("persona-1")!;
    persona.status = "review";
    persona.loraWeightKey = request.loraWeightKey;

    h.setStatus({ requestId, status: "ERROR", error: "late failure that must not win" });
    h.advance(9 * MINUTE);
    const [outcome] = await h.watchdog.reconcile();

    expect(outcome).toMatchObject({ action: "skipped_terminal", status: "ready" });
    expect(h.store.falTrainingRequests.get(requestId)!.status).toBe("ready");
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "review" });
    expect(h.downloads()).toEqual([]); // no artifact work on a terminal request
  });

  it("skips a poll that races a callback still holding the claim", async () => {
    const claims: string[] = [];
    const h = setup({
      repository: (base) => ({
        async claimCallback(requestId, fingerprint): Promise<FalTrainingCallbackClaim> {
          claims.push(fingerprint);
          // Another worker (the signed callback) holds an active lease.
          const request = await base
            .listInFlight({
              idleSince: new Date(BASE_TIME.getTime() + 10 * 60 * MINUTE),
              deadlineBefore: new Date(BASE_TIME.getTime() + 10 * 60 * MINUTE),
            })
            .then((rows) => rows.find((row) => row.requestId === requestId)!);
          return { claimed: false, duplicate: true, request };
        },
        completeCallback: (completion: FalTrainingCallbackCompletion) => base.completeCallback(completion),
        releaseCallback: (requestId: string, fingerprint: string) =>
          base.releaseCallback(requestId, fingerprint),
        listInFlight: (query: FalTrainingInFlightQuery) => base.listInFlight(query),
      }),
    });
    const requestId = await submitAndGoSilent(h);
    h.setStatus(readyStatus(requestId));
    h.advance(9 * MINUTE);

    const [outcome] = await h.watchdog.reconcile();
    expect(outcome).toMatchObject({ action: "skipped_duplicate", status: "queued" });
    expect(claims).toHaveLength(1);
    expect(h.store.falTrainingRequests.get(requestId)!.status).toBe("queued");
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "training" });
    expect(h.downloads()).toEqual([]);
  });

  it("re-polling the same terminal result is a duplicate, not a second advance", async () => {
    let snapshot: FalTrainingRequestRecord[] = [];
    const h = setup({
      repository: (base) => ({
        claimCallback: (requestId, fingerprint, leaseSeconds) =>
          base.claimCallback(requestId, fingerprint, leaseSeconds),
        completeCallback: (completion) => base.completeCallback(completion),
        releaseCallback: (requestId, fingerprint) => base.releaseCallback(requestId, fingerprint),
        // Always serve the original in-flight snapshot, as a lagging read
        // replica would, so the watchdog is invited to advance it twice.
        listInFlight: async () => snapshot,
      }),
    });
    const requestId = await submitAndGoSilent(h);
    snapshot = [{ ...h.store.falTrainingRequests.get(requestId)! }];
    h.setStatus(readyStatus(requestId));
    h.advance(9 * MINUTE);

    const [first] = await h.watchdog.reconcile();
    expect(first).toMatchObject({ action: "advanced_ready", status: "ready" });
    const downloadsAfterFirst = h.downloads().length;
    expect(downloadsAfterFirst).toBe(2);

    h.advance(MINUTE);
    const [second] = await h.watchdog.reconcile();
    expect(second.action).toBe("skipped_duplicate");
    expect(h.downloads()).toHaveLength(downloadsAfterFirst); // no re-copy
    expect(h.store.personas.get("persona-1")).toMatchObject({ status: "review" });
    expect(h.falLedger()).toHaveLength(1); // and no extra spend
  });
});

describe("208 — the production trigger: an authorized Persona status read reconciles", () => {
  it("builds a watchdog only from a provider that can actually read queue status", () => {
    const blobs = new InMemoryBlobStore();
    const store = new DataStore();
    const base = {
      isDevOnly: true,
      async startTraining() {
        return { jobId: "job-dev", status: "queued" as const };
      },
      async submitTraining() {
        return { jobId: "job-dev", status: "queued" as const };
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
    } satisfies FalAdapter;
    // A dev-only fake cannot poll fal: the caller gets null and must not
    // pretend the training was checked.
    expect(createFalTrainingWatchdog({ persistence: store, blobs, fal: base })).toBeNull();
    const capable: FalAdapter = {
      ...base,
      isDevOnly: false,
      async fetchTrainingStatus(query) {
        return { requestId: query.requestId, status: "IN_PROGRESS" };
      },
    };
    expect(createFalTrainingWatchdog({ persistence: store, blobs, fal: capable })).toBeInstanceOf(
      FalTrainingWatchdogService,
    );
  });

  it("wires reconciliation into the authorized Persona status read, after the ownership check", () => {
    const source = readFileSync("src/app/api/personas/[id]/route.ts", "utf-8");
    const ownership = source.indexOf("Persona not found");
    const reconcile = source.indexOf("watchdog.reconcile()");
    expect(ownership).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(ownership); // never before the 404 check
    expect(source).toContain("createFalTrainingWatchdog");
    // Bounded progress reaches the client instead of a bare spinner.
    expect(source).toContain("trainingProgress");
    expect(source).toContain("remainingMs");
  });
});

describe("208 — the real fal adapter status seam (fake fetch, never the network)", () => {
  function stubFetch(responses: Record<string, unknown>) {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const body = responses[url];
      if (body === undefined) throw new Error(`unexpected fetch ${url}`);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    return calls;
  }

  it("resolves a COMPLETED queue entry into an OK result with artifacts", async () => {
    vi.stubEnv("FAL_API_KEY", "test-key");
    const responseUrl = `https://queue.fal.run/${flux2.endpoint}/requests/job-1`;
    const calls = stubFetch({
      [STATUS_URL]: { status: "COMPLETED", response_url: responseUrl },
      [responseUrl]: {
        diffusers_lora_file: { url: "https://fal.media/files/weights.safetensors" },
        config_file: { url: "https://fal.media/files/config.json" },
      },
    });

    const result = await new RealFalAdapter().fetchTrainingStatus({
      requestId: "job-1",
      endpoint: flux2.endpoint,
      statusUrl: STATUS_URL,
    });
    expect(result).toMatchObject({ requestId: "job-1", status: "OK" });
    expect(result.payload?.diffusers_lora_file?.url).toContain("fal.media");
    expect(calls).toEqual([STATUS_URL, responseUrl]);
  });

  it("maps a queue FAILED entry to a terminal ERROR and IN_QUEUE to in-progress", async () => {
    vi.stubEnv("FAL_API_KEY", "test-key");
    stubFetch({ [STATUS_URL]: { status: "FAILED", error: "trainer crashed" } });
    await expect(
      new RealFalAdapter().fetchTrainingStatus({
        requestId: "job-1",
        endpoint: flux2.endpoint,
        statusUrl: STATUS_URL,
      }),
    ).resolves.toMatchObject({ status: "ERROR", error: "trainer crashed" });

    stubFetch({ [STATUS_URL]: { status: "IN_QUEUE", queue_position: 3 } });
    await expect(
      new RealFalAdapter().fetchTrainingStatus({
        requestId: "job-1",
        endpoint: flux2.endpoint,
        statusUrl: STATUS_URL,
      }),
    ).resolves.toMatchObject({ status: "IN_PROGRESS" });
  });

  it("refuses to fetch a persisted status URL that is not a fal queue origin", async () => {
    vi.stubEnv("FAL_API_KEY", "test-key");
    const calls = stubFetch({});
    await expect(
      new RealFalAdapter().fetchTrainingStatus({
        requestId: "job-1",
        endpoint: flux2.endpoint,
        statusUrl: "https://evil.example.com/status",
      }),
    ).rejects.toThrow(/trusted fal origin/);
    expect(calls).toEqual([]);
  });
});

describe("208 — COST-2: the live run reports BLOCKED without LIVE_PROVIDER_RUN_APPROVED", () => {
  const approvedEnvironment = {
    [LIVE_FAL_RUN_APPROVED_ENV]: "true",
    FAL_API_KEY: "fal-key",
    NEXT_PUBLIC_APP_URL: ORIGIN,
    [LIVE_LORA_RUN_PERSONA_IDS_ENV]: "p1,p2,p3,p4,p5",
  } satisfies Record<string, string | undefined>;

  it("reports BLOCKED naming the exact missing approval, and never PASS", () => {
    const plan = planLiveLoraTrainingRun({ ...approvedEnvironment, [LIVE_FAL_RUN_APPROVED_ENV]: undefined });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.exitCode).toBe(2);
    expect(plan.reason).toContain(LIVE_FAL_RUN_APPROVED_ENV);
    expect(plan.blockers.map((blocker) => blocker.code)).toEqual(["live_run_not_approved"]);
    expect(plan.providerCallsAttempted).toBe(0);
    expect(plan.lines.join("\n")).not.toContain("PASS:");
    expect(plan.lines.join("\n")).toContain("This is not a PASS");
    expect(plan.capUsd).toBe(20);
    expect(plan.warningAtUsd).toBe(18);
    expect(plan.trainingBudgetMs).toBe(FAL_TRAINING_BUDGET_MS);
  });

  it("also blocks on a missing key, callback origin, or consented Persona set", () => {
    expect(planLiveLoraTrainingRun({}).blockers.map((blocker) => blocker.code)).toEqual([
      "live_run_not_approved",
      "fal_api_key_missing",
      "callback_origin_missing",
      "consented_personas_missing",
    ]);
    expect(
      planLiveLoraTrainingRun({ ...approvedEnvironment, [LIVE_LORA_RUN_PERSONA_IDS_ENV]: "p1,p2" }).status,
    ).toBe("BLOCKED");
    // Only a fully satisfied environment is READY — and READY is still not a
    // PASS: this reporter runs no training, so it must never exit 0 (a green
    // exit in CI would read as an evidenced live run that never happened).
    const ready = planLiveLoraTrainingRun(approvedEnvironment);
    expect(ready.status).toBe("READY");
    expect(ready.exitCode).toBe(3);
    expect(ready.exitCode).not.toBe(0);
    expect(ready.providerCallsAttempted).toBe(0);
    expect(ready.lines.join("\n")).toContain("This is not a PASS");
  });

  it("the runnable report command prints BLOCKED and exits non-zero with the approval unset", () => {
    const env = { ...process.env };
    delete env[LIVE_FAL_RUN_APPROVED_ENV];
    let stdout = "";
    let exitCode = 0;
    try {
      stdout = execFileSync("npx", ["tsx", "tools/live-lora-training-run.ts"], {
        cwd: process.cwd(),
        env,
        encoding: "utf-8",
      });
    } catch (error) {
      const failure = error as { stdout?: string; status?: number };
      stdout = failure.stdout ?? "";
      exitCode = failure.status ?? 1;
    }
    expect(stdout).toContain("RESULT: BLOCKED");
    expect(stdout).toContain(LIVE_FAL_RUN_APPROVED_ENV);
    expect(stdout).toContain("No fal.ai request was made. This is not a PASS.");
    expect(stdout).not.toContain("RESULT: PASS");
    expect(exitCode).toBe(2);

    // The reporter is structurally incapable of spending: it holds no provider
    // client and is wired as a real npm command.
    const source = readFileSync("tools/live-lora-training-run.ts", "utf-8");
    expect(source).not.toMatch(/RealFalAdapter|submitTraining|queue\.fal\.run|fetch\(/);
    const scripts = (JSON.parse(readFileSync("package.json", "utf-8")) as {
      scripts: Record<string, string>;
    }).scripts;
    expect(scripts["report:live-lora-training"]).toBe("tsx tools/live-lora-training-run.ts");
  });
});
