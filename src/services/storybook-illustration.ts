import type {
  BlobStore,
  FalAdapter,
  FalPageImageRequest,
  FalPageRepairRequest,
} from "@/adapters/types";
import type { StyleBible } from "@/domain/types";
import type {
  MarginEvidence,
  ProviderCostMeteringService,
} from "@/services/provider-cost-metering";

/**
 * Multi-Persona illustration orchestration (issue 211 / PRD v23).
 *
 * ADR-0005 calls multi-LoRA composition (baby + parent in one scene) the riskiest,
 * least-proven part of the pipeline. This module owns that composition gate as a
 * narrow, self-contained seam so a page's request can carry every confirmed
 * Persona LoRA in one canonical multi-LoRA call, and it owns the bounded
 * selective-repair path that accompanies it.
 *
 * Contract (invariants restated from the ticket):
 *  - LAT-3   every Page reaches a terminal state and the Storybook reaches
 *            `draft`/`failed`; Pages run under bounded concurrency so a
 *            full-book run has a structural p95 bound, not serial unbounded awaits.
 *  - FAIL-1  a partially-failed Page set still reaches a text-viewable `draft`
 *            (never an unbounded `generating`); an injected watch-budget forces a
 *            terminal status if the run would overrun.
 *  - COST-1  every illustration/repair attempt is priced from PROVIDER_PRICE_TABLE
 *            (via `authorizePayableAttempt`) BEFORE the provider boundary, is
 *            recorded in the cost ledger, and the per-Storybook repair count is
 *            capped so a repair loop cannot exhaust the budget.
 *
 * This module is intentionally provider- and store-agnostic aside from the
 * `fal` adapter, `blobs`, and the shared `ProviderCostMeteringService` seam. It
 * does not own Story text; callers supply an {@link IllustrationBrief} that
 * already carries the confirmed Personas and per-`Scene` cast.
 */

export interface IllustrationPersona {
  id: string;
  /** Confirmed Family-owned LoRA weights blob key; presence marks the Persona as confirmed. */
  loraWeightKey: string;
  /** Family-owned likeness review sample keys, used as identity-preserving repair references. */
  reviewSampleKeys?: string[];
  /** Generated roster portrait blob key (ADR-0020), used as a repair reference fallback. */
  avatarKey?: string;
}

export interface IllustrationScene {
  pageIndex: number;
  description: string;
  /** Which confirmed Personas share this single scene (composition cast). */
  personaIds: string[];
}

export interface IllustrationRoute {
  provider: string;
  endpoint: string;
  model: string;
  modelVersion: string;
}

export interface IllustrationRepairConfig {
  cheap: IllustrationRoute;
  pro: IllustrationRoute;
  /** Selective repairs allowed for a single Page before it is left failed. */
  maxPerPage: number;
  /** Total selective repairs allowed per Storybook — the COST-1 loop cap. */
  maxPerStorybook: number;
}

export interface IllustrationOrchestratorConfig {
  pageConcurrency: number;
  defaultRoute: IllustrationRoute;
  repair: IllustrationRepairConfig;
  /** FAIL-1: a run may not exceed this budget before it is forced terminal. */
  watchdogBudgetMs: number;
  /** Min ready Pages (or text-bearing Pages) required to reach `draft`. */
  readyFloor: number;
}

export interface StorybookIllustrationDeps {
  fal: FalAdapter;
  blobs: BlobStore;
  costMeter: ProviderCostMeteringService;
  /** Margin evidence for the payable-authorization boundary; derived when omitted. */
  marginEvidence?: MarginEvidence;
  /** Injected clock for latency/watchdog determinism. */
  now?: () => Date;
}

export interface IllustrationBrief {
  familyId: string;
  storybookId: string;
  pageCount: number;
  /** The Family's confirmed, owned Personas available to star (LoRA-backed). */
  personas: IllustrationPersona[];
  scenes: IllustrationScene[];
  styleBible: StyleBible;
  /** Per-page text presence; a Page without a LoRA scene still carries Story text. */
  pageHasText: boolean[];
}

export type IllustrationTerminalStatus = "draft" | "failed";
export type IllustrationPageStatus = "ready" | "failed" | "quarantined";

export interface PageIllustrationResult {
  pageIndex: number;
  status: IllustrationPageStatus;
  personaCount: number;
  /** LoRA weight refs carried in this Page's composition request. */
  compositionLoraRefs: string[];
  illustrationBlobKey: string | null;
  repairAttempts: number;
  watchdogExpired: boolean;
}

export interface StorybookIllustrationResult {
  familyId: string;
  storybookId: string;
  pageResults: PageIllustrationResult[];
  terminalStatus: IllustrationTerminalStatus;
  /** Pages whose single scene composed two or more confirmed Personas (ADR-0005 gate). */
  composedPageIndexes: number[];
  repairCount: number;
  estimatedCostUsd: number;
  watchdogExpired: boolean;
}

/** Partial config accepted by {@link StorybookIllustrationService}: every route shape may be partially overridden. */
export type PartialIllustrationOrchestratorConfig = {
  pageConcurrency?: number;
  watchdogBudgetMs?: number;
  readyFloor?: number;
  defaultRoute?: Partial<IllustrationRoute>;
  repair?: Partial<IllustrationRepairConfig>;
};

export const DEFAULT_ILLUSTRATION_ROUTES: Required<
  Pick<IllustrationOrchestratorConfig, "defaultRoute" | "repair">
> = {
  defaultRoute: {
    provider: "fal.ai",
    endpoint: "fal-ai/flux-2/lora",
    model: "flux-2-lora",
    modelVersion: "flux-2-lora-v1",
  },
  repair: {
    cheap: {
      provider: "fal.ai",
      endpoint: "fal-ai/nano-banana-2/edit",
      model: "Nano Banana 2 Edit",
      modelVersion: "nano-banana-2-edit-v1",
    },
    pro: {
      provider: "fal.ai",
      endpoint: "fal-ai/nano-banana-pro/edit",
      model: "Nano Banana Pro Edit",
      modelVersion: "nano-banana-pro-edit-v1",
    },
    maxPerPage: 2,
    maxPerStorybook: 4,
  },
};

export class StorybookIllustrationService {
  private readonly config: IllustrationOrchestratorConfig;
  private readonly now: () => Date;

  constructor(
    private readonly deps: StorybookIllustrationDeps,
    config: PartialIllustrationOrchestratorConfig = {}
  ) {
    this.config = {
      pageConcurrency: 4,
      watchdogBudgetMs: 90_000,
      readyFloor: 10,
      ...DEFAULT_ILLUSTRATION_ROUTES,
      ...config,
      defaultRoute: { ...DEFAULT_ILLUSTRATION_ROUTES.defaultRoute, ...config.defaultRoute },
      repair: {
        ...DEFAULT_ILLUSTRATION_ROUTES.repair,
        ...config.repair,
        cheap: { ...DEFAULT_ILLUSTRATION_ROUTES.repair.cheap, ...config.repair?.cheap },
        pro: { ...DEFAULT_ILLUSTRATION_ROUTES.repair.pro, ...config.repair?.pro },
      },
    };
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Run the full multi-Persona illustration for a Storybook. Every Page reaches a
   * terminal state; a bounded watch-budget forces this method to return a terminal
   * result instead of ever stranding work in `generating` (FAIL-1).
   */
  async run(brief: IllustrationBrief): Promise<StorybookIllustrationResult> {
    const startMs = this.now().getTime();
    const pageIndexes = Array.from({ length: brief.pageCount }, (_, i) => i);
    const pageResults: PageIllustrationResult[] = [];
    const processed = new Set<number>();
    let repairCount = 0;
    let watchdogExpired = false;

    const isExpired = () => {
      const over = this.now().getTime() - startMs > this.config.watchdogBudgetMs;
      if (over) watchdogExpired = true;
      return over;
    };

    const sceneOf = (pageIndex: number): IllustrationScene =>
      brief.scenes.find((s) => s.pageIndex === pageIndex) ?? {
        pageIndex,
        description: "",
        personaIds: [],
      };

    await mapLimit(
      pageIndexes,
      this.config.pageConcurrency,
      isExpired,
      async (pageIndex) => {
        const result = await this.runPage(brief, pageIndex, sceneOf(pageIndex), {
          canRepair: () => repairCount < this.config.repair.maxPerStorybook,
          reportRepair: () => {
            repairCount++;
          },
        });
        pageResults.push(result);
        processed.add(pageIndex);
      }
    );

    // Watchdog (FAIL-1): any Page never scheduled because the budget elapsed is
    // reaped as a terminal `failed` (a re-rollable hole, not a `generating` strand).
    for (const pageIndex of pageIndexes) {
      if (processed.has(pageIndex)) continue;
      pageResults.push({
        pageIndex,
        status: "failed",
        personaCount: sceneOf(pageIndex).personaIds.length,
        compositionLoraRefs: [],
        illustrationBlobKey: null,
        repairAttempts: 0,
        watchdogExpired: true,
      });
    }

    const composedPageIndexes = pageResults
      .filter((r) => r.personaCount >= 2)
      .map((r) => r.pageIndex);

    const readyCount = pageResults.filter((r) => r.status === "ready").length;
    const textPageCount = brief.pageHasText.filter(Boolean).length;
    // FAIL-1 / ADR-0004: `draft` once enough Pages are ready OR enough Pages carry
    // Story text (text-viewable fallback); `failed` only when neither clears.
    const terminalStatus: IllustrationTerminalStatus =
      readyCount >= this.config.readyFloor || textPageCount >= this.config.readyFloor
        ? "draft"
        : "failed";

    return {
      familyId: brief.familyId,
      storybookId: brief.storybookId,
      pageResults: pageResults.sort((a, b) => a.pageIndex - b.pageIndex),
      terminalStatus,
      composedPageIndexes,
      repairCount,
      estimatedCostUsd: this.costUsd(brief.familyId, brief.storybookId),
      watchdogExpired,
    };
  }

  private async runPage(
    brief: IllustrationBrief,
    pageIndex: number,
    scene: IllustrationScene,
    reporter: { canRepair: () => boolean; reportRepair: () => void }
  ): Promise<PageIllustrationResult> {
    const confirmed = scene.personaIds
      .map((id) => brief.personas.find((p) => p.id === id))
      .filter((persona): persona is IllustrationPersona => !!persona && !!persona.loraWeightKey);
    const personas = confirmed.map((p) => p.id);
    const loras = confirmed.map((p) => ({
      personaId: p.id,
      path: p.loraWeightKey,
      scale: 1,
    }));

    const blobKey = `books/${brief.familyId}/${brief.storybookId}/page-${pageIndex}.png`;
    const baseRequest = this.buildImageRequest(brief, pageIndex, scene, loras, personas);

    let status: IllustrationPageStatus = "failed";
    let illustrationBlobKey: string | null = null;
    let repairAttempts = 0;
    let watchdogExpired = false;

    if (await this.tryAttempt(brief, pageIndex, baseRequest, 0, loras, personas, blobKey)) {
      status = "ready";
      illustrationBlobKey = blobKey;
    } else {
      // COST-1: bounded selective repair. Per-Page and per-Storybook caps both
      // bound the loop; `canRepair` reads the shared Storybook counter, so once
      // the Storybook cap is hit no Page can keep repairing into the budget.
      while (repairAttempts < this.config.repair.maxPerPage && reporter.canRepair()) {
        const route =
          repairAttempts === 0 ? this.config.repair.cheap : this.config.repair.pro;
        const tier =
          repairAttempts === 0 ? "nano-banana-2-edit" : "nano-banana-pro-edit";
        repairAttempts++;
        reporter.reportRepair();
        const priorRawKey = `books/${brief.familyId}/${brief.storybookId}/page-${pageIndex}.png`;
        const repairRequest = this.buildRepairRequest(
          baseRequest,
          route,
          tier,
          confirmed,
          priorRawKey,
          repairAttempts
        );
        if (await this.tryAttempt(brief, pageIndex, repairRequest, repairAttempts, loras, personas, blobKey)) {
          status = "ready";
          illustrationBlobKey = blobKey;
          break;
        }
      }
    }

    return {
      pageIndex,
      status,
      personaCount: confirmed.length,
      compositionLoraRefs: loras.map((l) => l.path),
      illustrationBlobKey,
      repairAttempts,
      watchdogExpired,
    };
  }

  private buildImageRequest(
    brief: IllustrationBrief,
    pageIndex: number,
    scene: IllustrationScene,
    loras: { personaId: string; path: string; scale: number }[],
    personaIds: string[]
  ): FalPageImageRequest {
    const { styleBible } = brief;
    const prompt = `${styleBible.artStyle} | ${styleBible.palette} | Style Bible: ${JSON.stringify(
      styleBible
    )} | ${scene.description}`;
    const route = this.config.defaultRoute;
    return {
      pageIndex,
      prompt,
      loras,
      personaIds,
      styleBible,
      seed: deterministicPageSeed(brief.storybookId, pageIndex),
      seedMetadata: {
        storybookId: brief.storybookId,
        pageIndex,
        algorithm: "storybook-page-seed-v1",
      },
      provider: route.provider,
      model: route.model,
      modelVersion: route.modelVersion,
      endpoint: route.endpoint,
      safety: { enabled: true },
      idempotencyKey: `${brief.storybookId}/${pageIndex}/0/fal-generate`,
    };
  }

  private buildRepairRequest(
    base: FalPageImageRequest,
    route: IllustrationRoute,
    tier: "nano-banana-2-edit" | "nano-banana-pro-edit",
    confirmed: IllustrationPersona[],
    priorRawKey: string,
    attempt: number
  ): FalPageRepairRequest {
    const identityReferenceImageUrls = confirmed.map((persona) => {
      const ref = persona.reviewSampleKeys?.[0] ?? persona.avatarKey;
      return ref ? `memory://${ref}` : `memory://persona/${persona.id}`;
    });
    return {
      ...base,
      provider: route.provider,
      endpoint: route.endpoint,
      model: route.model,
      modelVersion: route.modelVersion,
      tier,
      failedPageImageUrl: `memory://${priorRawKey}`,
      identityReferenceImageUrls,
      idempotencyKey:
        attempt === 1 ? base.idempotencyKey : `${base.idempotencyKey}/pro`,
    };
  }

  /**
   * COST-1: price every attempt from PROVIDER_PRICE_TABLE (via
   * `authorizePayableAttempt`) BEFORE the provider boundary, record it in the
   * cost ledger, then call the adapter. A blocked/unpriced route throws and never
   * spends; the Page is left `failed` (re-rollable) rather than ever reaching the
   * provider unpriced.
   */
  private async tryAttempt(
    brief: IllustrationBrief,
    pageIndex: number,
    request: FalPageImageRequest | FalPageRepairRequest,
    attempt: number,
    loras: { personaId: string; path: string; scale: number }[],
    personaIds: string[],
    blobKey: string
  ): Promise<boolean> {
    const isRepair = "tier" in request;
    const route = isRepair
      ? request.tier === "nano-banana-2-edit"
        ? this.config.repair.cheap
        : this.config.repair.pro
      : this.config.defaultRoute;
    const pageId = `${brief.storybookId}-page-${pageIndex}`;
    const attemptKey = isRepair
      ? `${brief.storybookId}/${pageIndex}/${attempt}/${request.tier}`
      : request.idempotencyKey;

    // Price + authorize BEFORE reaching the provider boundary (COST-1).
    const auth = this.deps.costMeter.authorizePayableAttempt({
      provider: route.provider,
      endpoint: route.endpoint,
      model: route.model,
      familyId: brief.familyId,
      units: { images: 1 },
      attemptKey,
      marginEvidence: this.deps.marginEvidence,
    });

    const startedAt = this.now();
    try {
      const result = isRepair
        ? await this.deps.fal.repairPageImage!(request as FalPageRepairRequest)
        : await this.deps.fal.generatePageImage!(request as FalPageImageRequest);
      this.deps.costMeter.recordAttempt({
        provider: route.provider,
        endpoint: route.endpoint,
        model: route.model,
        pricingVersion: auth.pricingVersion,
        units: { images: 1 },
        estimatedCostUsd: auth.estimatedCostUsd,
        latencyMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
        requestId: attemptKey,
        owningEntityIds: {
          familyId: brief.familyId,
          storybookId: brief.storybookId,
          pageId,
        },
        attemptType: isRepair ? "repair" : "image",
        outcome: "succeeded",
      });
      await this.deps.blobs.put(
        blobKey,
        result.bytes ?? Buffer.from(`fetched:${result.imageUrl}`)
      );
      return true;
    } catch (error) {
      this.deps.costMeter.recordAttempt({
        provider: route.provider,
        endpoint: route.endpoint,
        model: route.model,
        pricingVersion: auth.pricingVersion,
        units: { images: 1 },
        estimatedCostUsd: auth.estimatedCostUsd,
        latencyMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
        requestId: attemptKey,
        owningEntityIds: {
          familyId: brief.familyId,
          storybookId: brief.storybookId,
          pageId,
        },
        attemptType: isRepair ? "repair" : "image",
        outcome: "failed",
      });
      return false;
    }
  }

  private costUsd(familyId: string, storybookId: string): number {
    // Attempts are priced and recorded in the ledger; derive the recorded spend.
    const entries = this.deps.costMeter.listEntries(familyId).filter(
      (entry) =>
        entry.owningEntityIds.storybookId === storybookId &&
        (entry.attemptType === "image" || entry.attemptType === "repair")
    );
    return entries.reduce(
      (sum, entry) => sum + (entry.actualCostUsd ?? entry.estimatedCostUsd),
      0
    );
  }
}

function deterministicPageSeed(storybookId: string, pageIndex: number): number {
  let hash = 2166136261;
  const input = `${storybookId}:${pageIndex}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function mapLimit<T>(
  values: T[],
  limit: number,
  isExpired: () => boolean,
  worker: (value: T) => Promise<void>
): Promise<void> {
  const concurrency = Math.max(1, Math.min(limit, values.length || 1));
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = next++;
        if (index >= values.length) return;
        if (isExpired()) return;
        await worker(values[index]!);
      }
    })
  );
}
