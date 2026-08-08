import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import type {
  FalAdapter,
  FalImageResult,
  FalPageImageRequest,
  FalPageRepairRequest,
} from "@/adapters/types";
import { DataStore } from "@/db/store";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";
import {
  StorybookIllustrationService,
  type IllustrationBrief,
  type IllustrationPersona,
} from "@/services/storybook-illustration";

/**
 * Issue 211 — Illustrate twelve Pages with real multi-Persona likeness.
 *
 * The ADR-0005 composition gate, now with five confirmed LoRAs. This test drives
 * the multi-Persona illustration orchestration against expensive fake fal /
 * in-memory stores / the real cost ledger — never a paid network — and asserts
 * every restated invariant (LAT-3, FAIL-1, COST-1):
 *
 *  - FAIL-1  every Page reaches a terminal state and the Storybook reaches
 *            `draft`/`failed` within the watch-budget (injected clock).
 *  - ADR-0005 ≥1 Page composes two+ confirmed Personas: the composition request
 *            carries BOTH confirmed LoRA refs in one call.
 *  - LAT-3   p95 < 90s structural bound via bounded concurrency (injected clock;
 *            serial would blow the 90s bound, batched does not).
 *  - COST-1  bounded selective repair, per-Storybook repair-count cap (a repair
 *            loop cannot exhaust budget); spend priced from PROVIDER_PRICE_TABLE
 *            and recorded before every provider boundary.
 */

const MARGIN = { netSubscriptionRevenueUsd: 100, attributableCogsUsd: 20 };
const FIVE = ["p-maya", "p-priya", "p-sam", "p-rose", "p-ava"];
const PERSONAS: IllustrationPersona[] = FIVE.map((id) => ({
  id,
  loraWeightKey: `lora/${id}/weights.safetensors`,
  reviewSampleKeys: [`samples/${id}/0`],
  avatarKey: `avatar/${id}.png`,
}));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Advance fake timers stepwise until `pending` settles, returning the elapsed ms. */
async function drive<T>(pending: Promise<T>, capMs = 200_000): Promise<{ value: T; advanced: number }> {
  let advanced = 0;
  while (true) {
    const settled = await Promise.race([
      pending.then((value) => ({ done: true as const, value })),
      vi.advanceTimersByTimeAsync(1000).then(() => ({ done: false as const, value: undefined as T })),
    ]);
    advanced += 1000;
    if (settled.done) return { value: settled.value, advanced };
    if (advanced >= capMs) throw new Error("run did not terminate within the clock cap");
  }
}

class RecordingFal implements FalAdapter {
  readonly isDevOnly = true;
  generateRequests: FalPageImageRequest[] = [];
  repairRequests: FalPageRepairRequest[] = [];
  failPageGenerate = new Set<number>();
  failPageRepairAlways = new Set<number>();
  delayMs = 0;
  maxInFlight = 0;
  private inFlight = 0;

  private enter() {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
  }
  private exit() {
    this.inFlight--;
  }

  async generatePageImage(req: FalPageImageRequest): Promise<FalImageResult> {
    this.generateRequests.push(req);
    this.enter();
    if (this.delayMs) await sleep(this.delayMs);
    if (this.failPageGenerate.has(req.pageIndex)) {
      this.exit();
      throw new Error(`generate fail page ${req.pageIndex}`);
    }
    this.exit();
    const key = req.loras.map((l) => l.path).join("+") || "default";
    return {
      imageUrl: `https://example.com/${key}/${req.pageIndex}.png`,
      bytes: Buffer.from(`gen-${req.pageIndex}`),
    };
  }

  async repairPageImage(req: FalPageRepairRequest): Promise<FalImageResult> {
    this.repairRequests.push(req);
    this.enter();
    if (this.delayMs) await sleep(this.delayMs);
    if (this.failPageRepairAlways.has(req.pageIndex)) {
      this.exit();
      throw new Error(`repair fail page ${req.pageIndex}`);
    }
    this.exit();
    return {
      imageUrl: `https://example.com/repair/${req.pageIndex}.png`,
      bytes: Buffer.from(`repair-${req.pageIndex}`),
    };
  }

  async startTraining(): Promise<never> {
    throw new Error("unused");
  }
  async submitTraining(): Promise<never> {
    throw new Error("unused");
  }
  async generateImage(): Promise<never> {
    throw new Error("unused");
  }
  async inpaintFaces(): Promise<never> {
    throw new Error("unused");
  }
  async generateWithReferenceModel(): Promise<never> {
    throw new Error("unused");
  }
}

function scenes(): IllustrationBrief["scenes"] {
  return Array.from({ length: 12 }, (_, pageIndex) => {
    // Page 3 stars three confirmed Personas in one scene; Page 5 stars two;
    // the rest are single-Persona scenes. This is the ADR-0005 composition set.
    if (pageIndex === 3) {
      return { pageIndex, description: `Scene ${pageIndex}`, personaIds: ["p-maya", "p-priya", "p-sam"] };
    }
    if (pageIndex === 5) {
      return { pageIndex, description: `Scene ${pageIndex}`, personaIds: ["p-maya", "p-sam"] };
    }
    return { pageIndex, description: `Scene ${pageIndex}`, personaIds: ["p-maya"] };
  });
}

function brief(overrides: Partial<IllustrationBrief> = {}): IllustrationBrief {
  return {
    familyId: "family-1",
    storybookId: "story-211",
    pageCount: 12,
    personas: PERSONAS,
    scenes: scenes(),
    styleBible: { palette: "warm pastels", wardrobe: {}, artStyle: "watercolor" },
    pageHasText: Array.from({ length: 12 }, () => true),
    ...overrides,
  };
}

type IllustrationConfig = ConstructorParameters<typeof StorybookIllustrationService>[1];

function setup(overrides: { config?: IllustrationConfig; brief?: IllustrationBrief } = {}) {
  const store = new DataStore();
  const blobs = new InMemoryBlobStore();
  const fal = new RecordingFal();
  const costMeter = new ProviderCostMeteringService(store);
  const service = new StorybookIllustrationService(
    { fal, blobs, costMeter, marginEvidence: MARGIN },
    overrides.config
  );
  return { store, blobs, fal, costMeter, service, brief: overrides.brief ?? brief() };
}

describe("211 — multi-Persona illustration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("composes two+ confirmed Personas in one scene, carrying both LoRA refs (ADR-0005)", async () => {
    const { service, fal, blobs, brief } = setup();
    const result = await service.run(brief);

    // Every Page reaches a terminal state and a ready Page persisted its image.
    expect(result.pageResults).toHaveLength(12);
    for (const page of result.pageResults) {
      expect(["ready", "failed", "quarantined"]).toContain(page.status);
      if (page.status === "ready") {
        expect(page.illustrationBlobKey).not.toBeNull();
        expect(await blobs.get(page.illustrationBlobKey!)).not.toBeNull();
      }
    }
    expect(result.terminalStatus).toBe("draft");

    // At least one scene composes 2+ confirmed Personas: that request carries BOTH refs.
    const composed = fal.generateRequests.find((r) => r.loras.length >= 2);
    expect(composed).toBeDefined();
    expect([...composed!.loras.map((l) => l.path)]).toContain("lora/p-maya/weights.safetensors");
    expect([...composed!.loras.map((l) => l.path)]).toContain("lora/p-sam/weights.safetensors");
    expect(result.composedPageIndexes.filter((i) => i === 3 || i === 5).length).toBeGreaterThan(0);
  });

  it("bounds concurrency so a full 12-Page run stays under the 90s p95 structural bound (LAT-3)", async () => {
    vi.useFakeTimers();
    const { service, fal, brief } = setup({
      config: { pageConcurrency: 4, watchdogBudgetMs: 90_000 },
    });
    fal.delayMs = 10_000; // 10s per image: serial = 120s (> 90s), batched @4 = 30s

    const { value: result, advanced } = await drive(service.run(brief));

    // Batched, not serial: never more than the configured concurrency in flight,
    // and the wall-clock elapsed proves the run would NOT have finished serial
    // within the 90s bound yet DID finish batched (~30s).
    expect(fal.maxInFlight).toBeGreaterThan(1);
    expect(fal.maxInFlight).toBeLessThanOrEqual(4);
    expect(advanced).toBeGreaterThanOrEqual(20_000);
    expect(advanced).toBeLessThan(90_000);
    expect(result.watchdogExpired).toBe(false);
    expect(result.terminalStatus).toBe("draft");
  });

  it("caps selective repair per Storybook so a repair loop cannot exhaust budget (COST-1)", async () => {
    const { service, fal, store, brief } = setup({
      config: { repair: { maxPerPage: 2, maxPerStorybook: 2 } },
    });
    // Every Page fails on first generate; each would try to repair, but the
    // per-Storybook cap of 2 must stop the loop before the budget is drained.
    fal.failPageGenerate = new Set(Array.from({ length: 12 }, (_, i) => i));

    const result = await service.run(brief);

    expect(result.repairCount).toBe(2); // capped, not 12 * perPage
    // Every Page still reaches a terminal state; the Storybook still terminates.
    expect(result.pageResults).toHaveLength(12);
    for (const page of result.pageResults) {
      expect(["ready", "failed"]).toContain(page.status);
    }
    expect(["draft", "failed"]).toContain(result.terminalStatus);
    // Exactly two repair attempts were recorded and both are repairs priced non-zero.
    const repairs = [...store.providerCostLedgerEntries.values()].filter(
      (e) => e.attemptType === "repair"
    );
    expect(repairs).toHaveLength(2);
    expect(repairs.every((e) => e.estimatedCostUsd > 0)).toBe(true);
  });

  it("reaches a text-viewable draft when images partially fail, never an unbounded generating (FAIL-1)", async () => {
    const { service, fal, brief } = setup({
      // No repairs at all — pure partial image failure.
      config: { repair: { maxPerPage: 0, maxPerStorybook: 0 } },
    });
    // Six Pages fail the image pass (readyCount = 6 < floor 10), but every Page
    // still carries Story text, so the book must degrade to a text-viewable draft.
    fal.failPageGenerate = new Set([1, 2, 4, 6, 8, 10]);

    const result = await service.run(brief);

    expect(result.pageResults).toHaveLength(12);
    const failed = result.pageResults.filter((p) => p.status === "failed");
    expect(failed.length).toBe(6);
    expect(result.terminalStatus).toBe("draft");
    expect(result.watchdogExpired).toBe(false); // terminated on its own, not stranded
  });

  it("reaches failed (still terminal) when neither enough images nor text survive", async () => {
    const { service, fal } = setup({
      config: { repair: { maxPerPage: 0, maxPerStorybook: 0 } },
    });
    fal.failPageGenerate = new Set(Array.from({ length: 12 }, (_, i) => i));
    const failedBrief = brief({ pageHasText: Array.from({ length: 12 }, () => false) });

    const result = await service.run(failedBrief);

    expect(result.pageResults.every((p) => p.status === "failed")).toBe(true);
    expect(result.terminalStatus).toBe("failed");
  });

  it("forces a terminal result within the watch-budget and reaps overrun Pages (FAIL-1)", async () => {
    vi.useFakeTimers();
    const { service, fal, brief } = setup({
      config: { pageConcurrency: 1, watchdogBudgetMs: 90_000 },
    });
    // Serial 40s-per-page would need 480s for all 12; the watch-budget forces a
    // terminal result after ~3 pages, reaping the rest as failed.
    fal.delayMs = 40_000;

    const { value: result } = await drive(service.run(brief));

    expect(result.watchdogExpired).toBe(true);
    expect(["draft", "failed"]).toContain(result.terminalStatus);
    const reaped = result.pageResults.filter((p) => p.watchdogExpired === true);
    expect(reaped.length).toBeGreaterThan(0);
    expect(result.pageResults.length).toBe(12);
  });

  it("prices every attempt from PROVIDER_PRICE_TABLE and records spend BEFORE the provider boundary (COST-1)", async () => {
    const { service, fal, store, costMeter, brief } = setup();
    const order: string[] = [];
    const origAuth = costMeter.authorizePayableAttempt.bind(costMeter);
    const authSpy = vi
      .spyOn(costMeter, "authorizePayableAttempt")
      .mockImplementation((input) => {
        order.push(`auth:${input.attemptKey}`);
        return origAuth(input);
      });
    const origGen = fal.generatePageImage.bind(fal);
    const genSpy = vi.spyOn(fal, "generatePageImage").mockImplementation(async (req) => {
      order.push(`gen:${req.idempotencyKey}`);
      return origGen(req);
    });
    void authSpy;
    void genSpy;

    const result = await service.run(brief);

    // Every provider gen is immediately preceded by its own pre-boundary pricing.
    const genIndexes = order.map((e, i) => (e.startsWith("gen:") ? i : -1)).filter((i) => i >= 0);
    expect(genIndexes.length).toBe(12);
    for (const gi of genIndexes) {
      expect(gi).toBeGreaterThan(0);
      expect(order[gi - 1]!.startsWith("auth:")).toBe(true);
      expect(order[gi - 1]!.slice("auth:".length)).toBe(order[gi]!.slice("gen:".length));
    }

    // All 12 image attempts recorded, each priced from the table at 0.067 each.
    const images = [...store.providerCostLedgerEntries.values()].filter(
      (e) => e.attemptType === "image" && e.outcome === "succeeded"
    );
    expect(images).toHaveLength(12);
    for (const e of images) {
      expect(e.estimatedCostUsd).toBeCloseTo(0.067, 5);
      expect(e.pricingVersion).toBe("r1-image-v1");
    }
    expect(result.estimatedCostUsd).toBeCloseTo(12 * 0.067, 5);
  });
});
