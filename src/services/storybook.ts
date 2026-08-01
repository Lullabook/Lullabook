import { v4 as uuid } from "uuid";
import type {
  AnthropicAdapter,
  BlobStore,
  ClassicCatalog,
  FalAdapter,
  FalPageImageRequest,
  FalPageRepairRequest,
  VideoAdapter,
  WorkflowAdapter,
  WorkflowStep,
} from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { Brief, GeneratedStory, PageGenerationStatus, Storybook } from "@/domain/types";
import { readyPageFloor, resolvePageCount } from "@/domain/story-type";
import { ChildSafetyService } from "@/services/child-safety";
import { AutoContextService } from "@/services/auto-context";
import {
  ContextSelector,
  StoryContextSelector,
  NO_VISION_TEXT,
} from "@/services/context-selector";
import {
  PastStorySummaryService,
  pastStorySummaryProvider,
} from "@/services/past-story-summary";
import type { EntitlementService } from "@/services/entitlement";
import { EntitlementService as EntitlementServiceImpl } from "@/services/entitlement";
import type { SubscriptionService } from "@/services/subscription";
import { StoryCapService } from "@/services/story-cap";
import { isR1AudioEnabled } from "@/lib/r1-config";
import { R1_PLAN_DEFINITION } from "@/domain/plan";
import { getProductionStoryModel, validateGeneratedStoryContract } from "@/adapters/anthropic";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";
import { optionalEnv } from "@/adapters/env";

const FREE_REROLL_BUDGET = 5;

export const DEFAULT_PAGE_CONCURRENCY = 4;

export interface StorybookGenerationConfig {
  pageConcurrency?: number;
  defaultRoute?: {
    provider: string;
    endpoint: string;
    model: string;
    modelVersion: string;
  };
  repair?: {
    cheap: { provider: string; endpoint: string; model: string; modelVersion: string };
    pro: { provider: string; endpoint: string; model: string; modelVersion: string };
    maxPerPage?: number;
    maxPerStorybook?: number;
  };
}

export const DEFAULT_STORYBOOK_GENERATION_CONFIG: Required<StorybookGenerationConfig> = {
  pageConcurrency: DEFAULT_PAGE_CONCURRENCY,
  defaultRoute: {
    provider: optionalEnv("FAL_STORYBOOK_PROVIDER") ?? "fal.ai",
    endpoint: optionalEnv("FAL_STORYBOOK_ENDPOINT") ?? "fal-ai/flux-2/lora",
    model: optionalEnv("FAL_STORYBOOK_MODEL") ?? "flux-2-lora",
    modelVersion: optionalEnv("FAL_STORYBOOK_MODEL_VERSION") ?? "flux-2-lora-v1",
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

/**
 * Keep a Baby id only when the Baby actually exists. A stale pointer must not
 * reach the `storybooks.baby_id` foreign key — see
 * `tests/storybook-dangling-selected-baby.test.ts`.
 */
function resolveBabyId(babyId: string | null | undefined, store: DataStore): string | undefined {
  if (!babyId) return undefined;
  return store.babies.has(babyId) ? babyId : undefined;
}

function deterministicPageSeed(storybookId: string, pageIndex: number): number {
  let hash = 2166136261;
  for (const char of `${storybookId}:${pageIndex}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function mapWithConcurrency<T>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  const concurrency = Math.max(1, Math.min(limit, values.length || 1));
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = next++;
        if (index >= values.length) return;
        await worker(values[index]!);
      }
    })
  );
}

/**
 * Watchdog budget: a Storybook may not remain in `generating` longer than this
 * before the reaper forces it `failed` (PRD v13 / issue 100 — generation
 * always reaches a terminal state within a bounded window). Configurable via
 * the `reapStrandedGenerations` parameter; ~5 min default per the PRD.
 */
export const DEFAULT_GENERATION_WATCHDOG_BUDGET_MS = 5 * 60 * 1000;

type PersonaRecord = NonNullable<ReturnType<DataStore["getPersona"]>>;

export class StorybookService {
  private readonly autoContext: AutoContextService;
  private readonly pastStorySummary: PastStorySummaryService;
  private readonly contextSelector: ContextSelector;
  private readonly entitlements: EntitlementService;
  private readonly storyCap: StoryCapService;

  constructor(
    private readonly store: DataStore,
    private readonly anthropic: AnthropicAdapter,
    private readonly fal: FalAdapter,
    private readonly childSafety: ChildSafetyService,
    private readonly blobs: BlobStore,
    private readonly workflow: WorkflowAdapter,
    private readonly subscriptions: SubscriptionService,
    private readonly classicCatalog: ClassicCatalog,
    private readonly useReferenceModelForMulti = false,
    private readonly video: VideoAdapter | null = null,
    contextSelector: ContextSelector | null = null,
    pastStorySummary: PastStorySummaryService | null = null,
    entitlements: EntitlementService | null = null,
    generationConfig: StorybookGenerationConfig = {},
    private readonly costMeter: ProviderCostMeteringService = new ProviderCostMeteringService(store)
  ) {
    this.autoContext = new AutoContextService(store);
    this.pastStorySummary = pastStorySummary ?? new PastStorySummaryService(store);
    this.entitlements = entitlements ?? new EntitlementServiceImpl(store, subscriptions);
    this.storyCap = new StoryCapService(store, this.entitlements);
    this.contextSelector =
      contextSelector ??
      new StoryContextSelector(
        store,
        this.autoContext,
        pastStorySummaryProvider(this.pastStorySummary),
        NO_VISION_TEXT
      );
    this.generationConfig = {
      ...DEFAULT_STORYBOOK_GENERATION_CONFIG,
      ...generationConfig,
      defaultRoute: {
        ...DEFAULT_STORYBOOK_GENERATION_CONFIG.defaultRoute,
        ...generationConfig.defaultRoute,
      },
      repair: {
        ...DEFAULT_STORYBOOK_GENERATION_CONFIG.repair,
        ...generationConfig.repair,
        cheap: {
          ...DEFAULT_STORYBOOK_GENERATION_CONFIG.repair.cheap,
          ...generationConfig.repair?.cheap,
        },
        pro: {
          ...DEFAULT_STORYBOOK_GENERATION_CONFIG.repair.pro,
          ...generationConfig.repair?.pro,
        },
      },
    };
  }

  private readonly generationConfig: Required<StorybookGenerationConfig>;

  private normalizeBrief(memberId: string, brief: Brief): Brief {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    const babyPersona = [...this.store.personas.values()].find(
      (p) => p.familyId === member.familyId && p.kind === "baby" && p.status === "ready"
    );
    const starringPersonaIds = [...brief.starringPersonaIds];
    if (process.env.R1_ONE_PLAN === "true" && brief.pageCount !== undefined && brief.pageCount !== 12) {
      throw new Error("R1 Storybooks must contain exactly 12 Pages");
    }
    if (babyPersona && !starringPersonaIds.includes(babyPersona.id)) {
      starringPersonaIds.unshift(babyPersona.id);
    }

    if (starringPersonaIds.length > R1_PLAN_DEFINITION.limits.starringPersonas) {
      throw new Error(
        `A Storybook may star at most ${R1_PLAN_DEFINITION.limits.starringPersonas} Personas`
      );
    }

    return {
      ...brief,
      starringPersonaIds,
      // A `selectedBabyId` can outlive its Baby row (sync() upserts tables
      // independently, so a partial persist strands the pointer). Handing an
      // unknown id to the storybooks.baby_id FK fails the whole generation and
      // nothing in the UI can clear it — degrade to "no Baby" instead.
      babyId: resolveBabyId(brief.babyId ?? member.selectedBabyId, this.store),
      pageCount: resolvePageCount(brief),
    };
  }

  getVoiceClipForPage(brief: Brief, pageIndex: number, pageCount: number): string | null {
    if (brief.lullabyClipId && pageIndex === pageCount - 1) {
      return brief.lullabyClipId;
    }
    const ids = brief.voiceClipIds ?? [];
    return ids[pageIndex] ?? null;
  }

  async generate(memberId: string, brief: Brief): Promise<Storybook> {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    // ADR-0023 / issue 91: server-side entitlement gate. An unentitled Household
    // is rejected with 403 (EntitlementError) — the client UI gate is UX only.
    this.entitlements.requireEntitled(member.familyId);
    // ADR-0025 / issue 117: per-member create-rights gate. Just Us → Guardian
    // only; Our Whole Family → any Member. The actor memberId comes from the
    // verified Bearer JWT, never the request body.
    this.entitlements.requireCanCreate(member.familyId, memberId);
    // ADR-0025 / issue 118: enforce the monthly Story cap (shared Household
    // pool, idempotent by storybookId, resets monthly).
    this.storyCap.requireUnderCap(member.familyId, memberId);
    // Narration (real-voice weave) is a Normal+ capability: a Brief that carries
    // voice clips is rejected 403 on Basic. Issue 145 — audio is cut from R1, so
    // the narration gate is skipped (a cut Brief never carries voice anyway).
    if (isR1AudioEnabled() && ((brief.voiceClipIds?.length ?? 0) > 0 || brief.lullabyClipId)) {
      this.entitlements.requireCapability(member.familyId, "narrate");
    }

    const note = [brief.note, brief.customStyleNote].filter(Boolean).join(" ");
    if (note) await this.childSafety.checkText(note, `brief-${memberId}`);

    const normalized = this.normalizeBrief(memberId, brief);

    for (const id of normalized.starringPersonaIds) {
      const p = this.store.getPersona(id, memberId);
      if (!p || p.status !== "ready") throw new Error(`Persona ${id} not ready`);
      // Issue 125: likeness-confirmation gate — no book spend until the
      // Guardian has reviewed samples + accepted the trained Persona. `!== true`
      // (not `=== false`) so legacy/undefined rows also block until confirmed.
      if (p.likenessConfirmed !== true) {
        throw new Error(`Persona ${id} likeness not confirmed`);
      }
    }

    const storybook: Storybook = {
      id: uuid(),
      familyId: member.familyId,
      babyId: normalized.babyId,
      createdByMemberId: memberId,
      status: "generating",
      brief: normalized,
      styleBible: null,
      rerollBudgetRemaining: FREE_REROLL_BUDGET,
      rerollCredits: 0,
      createdAt: new Date(),
      finalizedAt: null,
    };
    this.storyCap.reserve(member.familyId, memberId, storybook.id);
    this.store.saveStorybook(storybook);

    // Thin request, fat workflow (ADR-0011): the closure is what the
    // in-memory fake drains; the durable adapter ignores it and re-enters
    // runGenerationBody from the serialized payload instead.
    this.workflow.enqueue(
      `storybook-${storybook.id}`,
      async () => this.runGenerationBody(memberId, storybook.id),
      { type: "storybook-generate", storybookId: storybook.id, memberId }
    );

    return storybook;
  }

  async generateFromClassic(
    memberId: string,
    classicId: string,
    brief: Brief
  ): Promise<Storybook> {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    // ADR-0023 / issue 91: server-side entitlement gate (403 on unentitled).
    this.entitlements.requireEntitled(member.familyId);
    // ADR-0025 / issue 117: per-member create-rights gate.
    this.entitlements.requireCanCreate(member.familyId, memberId);
    this.storyCap.requireUnderCap(member.familyId, memberId);
    if ((brief.voiceClipIds?.length ?? 0) > 0 || brief.lullabyClipId) {
      this.entitlements.requireCapability(member.familyId, "narrate");
    }

    const sourceTale = this.classicCatalog.getById(classicId);
    if (!sourceTale) {
      throw new Error("Classic not found in catalog");
    }

    const twist = [brief.note, brief.customStyleNote].filter(Boolean).join(" ");
    if (twist) await this.childSafety.checkText(twist, `classic-twist-${memberId}`);

    if (process.env.R1_ONE_PLAN === "true" && brief.pageCount !== undefined && brief.pageCount !== 12) {
      throw new Error("R1 Storybooks must contain exactly 12 Pages");
    }
    if (brief.starringPersonaIds.length > R1_PLAN_DEFINITION.limits.starringPersonas) {
      throw new Error(
        `A Storybook may star at most ${R1_PLAN_DEFINITION.limits.starringPersonas} Personas`
      );
    }

    for (const id of brief.starringPersonaIds) {
      const p = this.store.getPersona(id, memberId);
      if (!p || p.status !== "ready") throw new Error(`Persona ${id} not ready`);
      // Issue 125: likeness-confirmation gate (`!== true`, same as generate path).
      if (p.likenessConfirmed !== true) {
        throw new Error(`Persona ${id} likeness not confirmed`);
      }
    }

    const classicBrief: Brief = {
      ...brief,
      theme: sourceTale.title,
    };

    const storybook: Storybook = {
      id: uuid(),
      familyId: member.familyId,
      createdByMemberId: memberId,
      status: "generating",
      brief: classicBrief,
      classicId,
      styleBible: null,
      rerollBudgetRemaining: FREE_REROLL_BUDGET,
      rerollCredits: 0,
      createdAt: new Date(),
      finalizedAt: null,
    };
    this.storyCap.reserve(member.familyId, memberId, storybook.id);
    this.store.saveStorybook(storybook);

    this.workflow.enqueue(
      `storybook-${storybook.id}`,
      async () => this.runGenerationBody(memberId, storybook.id),
      { type: "storybook-generate", storybookId: storybook.id, memberId }
    );

    return storybook;
  }

  /**
   * The durable workflow body for the generate path. Reconstructs everything
   * from persisted state (PRD v2: no in-process variables cross the queue
   * boundary) and branches original-vs-classic on the Storybook's classicId.
   *
   * ADR-0004 / PRD v13 (issue 100): the "never strand in `generating`"
   * backstop lives HERE, in the service, so it holds on EVERY workflow
   * adapter (Inngest, LocalDevWorkflowAdapter, FakeWorkflow) — not just the
   * Inngest function. Any throw anywhere in the pipeline forces the book to a
   * terminal `failed` if it is still `generating`, then re-throws so the
   * caller (POST route / Inngest function) can surface the error. The reader
   * treats `failed` as the re-rollable floor, never an infinite "Illustrating".
   */
  async runGenerationBody(memberId: string, storybookId: string): Promise<void> {
    try {
      await this.runGenerationBodyInner(memberId, storybookId);
    } catch (err) {
      this.markFailedIfGenerating(storybookId);
      throw err;
    }
  }

  /** Forces a still-`generating` book to `failed`; leaves already-terminal books untouched. */
  private markFailedIfGenerating(storybookId: string): void {
    const storybook = this.store.storybooks.get(storybookId);
    if (storybook && storybook.status === "generating") {
      this.storyCap.release(storybookId);
      storybook.status = "failed";
      this.store.saveStorybook(storybook);
    }
  }

  /**
   * Watchdog: mark every Storybook still in `generating` past the budget as
   * `failed`. Defends against a run that never completes (process crash, hung
   * step, lost job). Returns the count reaped. Caller is responsible for
   * persisting (the reader poll calls `ctx.persist()` when this returns > 0).
   */
  reapStrandedGenerations(
    now: Date = new Date(),
    budgetMs: number = DEFAULT_GENERATION_WATCHDOG_BUDGET_MS
  ): number {
    let reaped = 0;
    for (const storybook of this.store.storybooks.values()) {
      if (storybook.status !== "generating") continue;
      if (now.getTime() - storybook.createdAt.getTime() > budgetMs) {
        const persisted = this.store.persistedGenerations.get(storybook.id);
        const hasValidText = Boolean(
          persisted?.story.pages.length &&
          persisted.story.pages.some((page) => page.text.trim().length > 0)
        );
        if (hasValidText) {
          // Text succeeded, so Page recovery must not refund or recharge allowance.
          storybook.status = "draft";
        } else {
          this.storyCap.release(storybook.id);
          storybook.status = "failed";
        }
        this.store.saveStorybook(storybook);
        reaped++;
      }
    }
    return reaped;
  }

  /** Production uses one PostgreSQL claim; in-memory adapters retain deterministic fallback. */
  async reapStrandedGenerationsDurably(
    now: Date = new Date(),
    budgetMs: number = DEFAULT_GENERATION_WATCHDOG_BUDGET_MS
  ): Promise<number> {
    const durableStore = this.store as DataStore & {
      reapStrandedStorybookGenerations?: (at: Date, budget: number) => Promise<number>;
    };
    if (durableStore.reapStrandedStorybookGenerations) {
      return durableStore.reapStrandedStorybookGenerations(now, budgetMs);
    }
    return this.reapStrandedGenerations(now, budgetMs);
  }

  private async runGenerationBodyInner(memberId: string, storybookId: string): Promise<void> {
    const storybook = this.store.storybooks.get(storybookId);
    if (!storybook) return;

    const brief = storybook.brief;
    const pageCount = resolvePageCount(brief);
    const personas = brief.starringPersonaIds.map((id) => {
      const p = this.store.getPersona(id, memberId);
      if (!p) throw new Error(`Persona ${id} not found`);
      return p;
    });
    const characterNames = (brief.starringCharacterIds ?? [])
      .map((id) => this.store.getCharacter(id, memberId)?.displayName)
      .filter(Boolean) as string[];

    let lullabyPhrase: string | undefined;
    if (isR1AudioEnabled() && brief.lullabyClipId) {
      const clip = this.store.getVoiceClip(brief.lullabyClipId, memberId);
      lullabyPhrase = clip?.transcript;
    }

    const note = [brief.note, brief.customStyleNote].filter(Boolean).join(" ");
    const artNote = brief.artStyle ? `Art style: ${brief.artStyle}.` : "";

    let momentContext: string | undefined;
    let sourceManifest: Storybook["sourceManifest"];
    // R1 restores the bounded Story Context Engine. The complete authorized
    // corpus remains in Family-scoped storage; only this deterministic selected
    // set is disclosed to the provider.
    if (brief.babyId) {
      const contextSet = await this.contextSelector.selectForBaby(
        memberId,
        brief.babyId,
        brief.starringPersonaIds
      );
      momentContext = contextSet.promptBlock || undefined;
      sourceManifest = contextSet.sourceManifest;
    }

    const generateStory = storybook.classicId
      ? async () => {
          const sourceTale = this.classicCatalog.getById(storybook.classicId!);
          if (!sourceTale) throw new Error("Classic not found in catalog");
          return this.anthropic.adaptStory({
            sourceTale,
            personaNames: personas.map((p) => p.displayName),
            personaIds: personas.map((p) => p.id),
            pageCount,
            storyType: brief.storyType,
            twist: note || undefined,
          });
        }
      : async () =>
          this.anthropic.generateStory({
            brief: `${brief.theme} ${brief.setting ?? ""} ${note} ${artNote}`,
            personaNames: personas.map((p) => p.displayName),
            personaIds: personas.map((p) => p.id),
            characterNames,
            pageCount,
            storyType: brief.storyType,
            lullabyPhrase,
            momentContext,
          });

    await this.runGeneration(memberId, storybookId, brief, personas, generateStory, sourceManifest);
  }

  recoverPage(memberId: string, pageId: string): void {
    const page = this.store.pages.get(pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");
    if (page.generationStatus !== "failed" && page.generationStatus !== "quarantined") {
      throw new Error("Page is not recoverable");
    }
    if (!this.store.getPersistedGeneration(book.id)) {
      throw new Error("Persisted generation not found");
    }

    const priorPageAttempts = this.countRecoveryAttempts(pageId);
    const priorBookAttempts = this.store
      .getPagesForStorybook(book.id)
      .reduce((total, candidatePage) => total + this.countRecoveryAttempts(candidatePage.id), 0);
    const maxPerPage = this.generationConfig.repair.maxPerPage ?? 2;
    const maxPerStorybook = this.generationConfig.repair.maxPerStorybook ?? 4;
    if (priorPageAttempts >= maxPerPage) {
      throw new Error("Page repair limit exhausted");
    }
    if (priorBookAttempts >= maxPerStorybook) {
      throw new Error("Storybook repair limit exhausted");
    }
    const recoverAttempt = priorPageAttempts + 1;

    this.workflow.enqueue(
      `recover-${pageId}`,
      async () => this.runRecoveryBody(memberId, pageId, recoverAttempt),
      { type: "page-recover", pageId, memberId, attempt: recoverAttempt }
    );
  }

  /**
   * The durable workflow body for free recovery of a failed/quarantined Page
   * (ADR-0004: system-caused recovery never spends the re-roll budget).
   */
  async runRecoveryBody(memberId: string, pageId: string, attempt: number): Promise<void> {
    const page = this.store.pages.get(pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");

    const persisted = this.store.getPersistedGeneration(book.id);
    if (!persisted) throw new Error("Persisted generation not found");

    const pageData = persisted.story.pages.find((p) => p.index === page.index);
    if (!pageData) throw new Error("Page data not found");

    const scene = persisted.story.scenes
      .map((s) => ({ ...s, personaIds: book.brief.starringPersonaIds }))
      .find((s) => s.pageIndex === page.index);
    if (!scene) throw new Error("Scene not found");

    const personas = book.brief.starringPersonaIds.map((id) => {
      const p = this.store.getPersona(id, memberId);
      if (!p) throw new Error(`Persona ${id} not found`);
      return p;
    });

    await this.runPagePipeline(book, pageData, scene, personas, persisted.story, attempt);
    await this.finalizeStorybookStatus(book.id);
  }

  private recordAnthropicAttempt(
    storybook: Storybook,
    startedAt: number,
    fallbackOutcome: "succeeded" | "failed"
  ): void {
    const evidence = (this.anthropic as AnthropicAdapter & {
      lastGenerationEvidence?: {
        model?: string;
        outcome?: "success" | "refusal" | "max_tokens" | "provider_error";
        providerRequestId?: string;
        inputTokens?: number;
        outputTokens?: number;
      };
    }).lastGenerationEvidence;
    this.costMeter.recordAttempt({
      provider: "anthropic",
      endpoint: "messages.create",
      model: evidence?.model ?? "unknown-anthropic-model",
      pricingVersion: "r1-text-v1",
      units: {
        input_tokens: evidence?.inputTokens ?? 0,
        output_tokens: evidence?.outputTokens ?? 0,
      },
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      latencyMs: Math.max(0, Date.now() - startedAt),
      requestId: evidence?.providerRequestId ?? `${storybook.id}/story`,
      owningEntityIds: { familyId: storybook.familyId, storybookId: storybook.id },
      attemptType: "text",
      outcome: evidence?.outcome === "success" ? "succeeded" : fallbackOutcome,
    });
  }

  private recordFalAttempt(
    storybook: Storybook,
    pageId: string,
    attempt: number,
    startedAt: number,
    outcome: "succeeded" | "failed",
    route = attempt > 0 ? this.generationConfig.repair.cheap : this.generationConfig.defaultRoute
  ): void {
    this.costMeter.recordAttempt({
      provider: route.provider,
      endpoint: route.endpoint,
      model: route.model,
      pricingVersion: "r1-image-v1",
      units: { images: 1 },
      estimatedCostUsd: 0,
      latencyMs: Math.max(0, Date.now() - startedAt),
      requestId: `${storybook.id}/${pageId}/attempt-${attempt}`,
      owningEntityIds: {
        familyId: storybook.familyId,
        storybookId: storybook.id,
        pageId,
      },
      attemptType: attempt > 0 ? "repair" : "image",
      outcome,
    });
  }

  private async runGeneration(
    memberId: string,
    storybookId: string,
    brief: Brief,
    personas: PersonaRecord[],
    generateStory: () => Promise<GeneratedStory>,
    sourceManifest?: Storybook["sourceManifest"]
  ): Promise<void> {
    const storybook = this.store.storybooks.get(storybookId);
    if (!storybook) return;

    if (sourceManifest) {
      // Persist only the bounded identifier/count manifest. The context text,
      // photo descriptions, and raw image data are transient provider input.
      storybook.sourceManifest = sourceManifest;
      const existing = [...this.store.storyContextProvenance.values()].find(
        (provenance) => provenance.storybookId === storybook.id
      );
      const provenanceId = existing?.id ?? uuid();
      this.store.storyContextProvenance.set(provenanceId, {
        id: provenanceId,
        familyId: sourceManifest.familyId,
        storybookId: storybook.id,
        babyId: sourceManifest.babyId,
        personaIds: [...sourceManifest.personaIds],
        momentIds: [...sourceManifest.momentIds],
        firstCount: sourceManifest.firstCount,
        pastStorySummaryIncluded: sourceManifest.pastStorySummaryIncluded,
        photoDescriptionCount: sourceManifest.photoDescriptionCount,
        tokenEstimate: sourceManifest.tokenEstimate,
      });
      this.store.saveStorybook(storybook);
    }

    await this.workflow.run([
      {
        name: "claude-pass",
        idempotencyKey: `${storybookId}/story`,
        run: async () => {
          const startedAt = Date.now();
          try {
            // This is immediately adjacent to the payable provider invocation,
            // rather than the earlier allowance reservation/enqueue boundary.
            this.costMeter.assertSpendAllowed({
              familyId: storybook.familyId,
              provider: "anthropic",
              model: getProductionStoryModel(),
              endpoint: "messages.create",
            });
            const generated = await generateStory();
            this.recordAnthropicAttempt(storybook, startedAt, "succeeded");
            try {
              validateGeneratedStoryContract(generated, resolvePageCount(brief), brief.starringPersonaIds);
            } catch {
              // Semantically invalid Story text is a terminal generation
              // outcome, not a workflow crash: persist nothing so the
              // post-step readback below takes the failed path — release the
              // reserved allowance, mark the book failed, and spend zero
              // illustration budget. (The validator's throwing contract is
              // still exercised directly by callers/tests that need it.)
              return;
            }

            this.store.savePersistedGeneration({
              storybookId,
              story: generated,
              persistedAt: new Date(),
            });

            storybook.styleBible = generated.styleBible;
            this.store.saveStorybook(storybook);
          } catch (error) {
            this.recordAnthropicAttempt(storybook, startedAt, "failed");
            throw error;
          }
        },
      },
    ]);

    const persistedAfterText = this.store.getPersistedGeneration(storybookId);
    const textIsValid = Boolean(
      persistedAfterText?.story.text?.trim() &&
        persistedAfterText.story.pages?.length === resolvePageCount(brief) &&
        persistedAfterText.story.scenes?.length === resolvePageCount(brief)
    );
    if (textIsValid) this.storyCap.commit(storybookId);
    if (persistedAfterText?.story.pages?.length && brief.babyId) {
      this.autoContext.advanceWatermark(brief.babyId);
    }

    // Read back the persisted pass, never an in-process variable: on an
    // at-least-once replay the memoized claude-pass step does not re-execute,
    // and only persisted state survives the step boundary (PRD v2).
    const persisted = this.store.getPersistedGeneration(storybookId);
    if (!textIsValid || !persisted?.story.pages?.length || !persisted.story.scenes?.length) {
      this.storyCap.release(storybookId);
      storybook.status = "failed";
      this.store.saveStorybook(storybook);
      return;
    }
    const scenes = persisted.story.scenes.map((s) => ({
      ...s,
      personaIds: brief.starringPersonaIds,
    }));

    await mapWithConcurrency(
      persisted.story.pages,
      this.generationConfig.pageConcurrency,
      async (pageData) => {
        const scene = scenes.find((s) => s.pageIndex === pageData.index)!;
        await this.runPagePipeline(storybook, pageData, scene, personas, persisted.story, 0);
      }
    );

    await this.finalizeStorybookStatus(storybookId);
  }

  private async runPagePipeline(
    storybook: Storybook,
    pageData: { index: number; text: string },
    scene: { pageIndex: number; description: string; personaIds: string[] },
    personas: PersonaRecord[],
    story: GeneratedStory,
    attempt: number
  ): Promise<void> {
    if (process.env.NODE_ENV === "production" && this.fal.isDevOnly) {
      throw new Error("Development fal fallback is unavailable in production");
    }
    await this.workflow.run(
      this.buildPageWorkflowSteps(storybook, pageData, scene, personas, story, attempt)
    );
  }

  private async generatePageImageForAttempt(
    storybook: Storybook,
    pageIndex: number,
    scene: { pageIndex: number; description: string; personaIds: string[] },
    personas: PersonaRecord[],
    story: GeneratedStory,
    attempt: number,
    prefix: string
  ): Promise<{ imageUrl: string; bytes?: Buffer }> {
    const personaIds = scene.personaIds;
    const selectedPersonas = personaIds.map((personaId) => {
      const persona =
        personas.find((candidate) => candidate.id === personaId) ??
        this.store.personas.get(personaId);
      if (!persona || persona.familyId !== storybook.familyId || !persona.loraWeightKey?.trim()) {
        throw new Error(`Persona ${personaId} has no owned LoRA available for Page generation`);
      }
      return persona;
    });
    const loras = selectedPersonas.map((persona) => ({
      personaId: persona.id,
      path: persona.loraWeightKey!,
      scale: 1,
    }));
    const styleBible = story.styleBible;
    const basePrompt = `${styleBible.artStyle} | ${styleBible.palette} | Style Bible: ${JSON.stringify(styleBible)} | ${scene.description}`;
    const defaultRoute = this.generationConfig.defaultRoute;
    const baseRequest: FalPageImageRequest = {
      pageIndex,
      prompt: basePrompt,
      loras,
      personaIds,
      styleBible,
      seed: deterministicPageSeed(storybook.id, pageIndex),
      seedMetadata: {
        storybookId: storybook.id,
        pageIndex,
        algorithm: "storybook-page-seed-v1",
      },
      provider: defaultRoute.provider,
      model: defaultRoute.model,
      modelVersion: defaultRoute.modelVersion,
      endpoint: defaultRoute.endpoint,
      safety: { enabled: true },
      idempotencyKey: `${prefix}/fal-generate`,
    };

    const priorRawKey = `books/${storybook.familyId}/${storybook.id}/page-${pageIndex}.png.attempt-${attempt - 1}.raw`;
    if (attempt > 0 && this.fal.repairPageImage && (await this.blobs.get(priorRawKey))) {
      // Repairs are edits of a previous, Family-owned image attempt. If an
      // upstream failure returned no image, recovery falls back to the normal
      // canonical multi-LoRA route rather than fabricating an edit reference.
      const identityReferenceImageUrls = await Promise.all(
        selectedPersonas.map(async (persona) => {
          const key = persona.reviewSampleKeys?.[0] ?? persona.avatarKey;
          if (!key || !(await this.blobs.get(key))) {
            throw new Error(`Persona ${persona.id} has no owned identity-preserving reference`);
          }
          return this.blobs.signedUrl(key);
        })
      );
      const failedPageImageUrl = await this.blobs.signedUrl(priorRawKey);
      let lastError: unknown;
      const routes = [
        { ...this.generationConfig.repair.cheap, tier: "nano-banana-2-edit" as const },
        { ...this.generationConfig.repair.pro, tier: "nano-banana-pro-edit" as const },
      ];
      for (const [routeIndex, route] of routes.entries()) {
        const request: FalPageRepairRequest = {
          ...baseRequest,
          provider: route.provider,
          endpoint: route.endpoint,
          model: route.model,
          modelVersion: route.modelVersion,
          tier: route.tier,
          failedPageImageUrl,
          identityReferenceImageUrls,
          idempotencyKey: routeIndex === 0 ? baseRequest.idempotencyKey : `${baseRequest.idempotencyKey}/pro`,
        };
        const startedAt = Date.now();
        try {
          this.costMeter.assertSpendAllowed({
            familyId: storybook.familyId,
            provider: request.provider,
            model: request.model,
            endpoint: request.endpoint,
          });
          const result = await this.fal.repairPageImage(request);
          this.recordFalAttempt(storybook, `${storybook.id}-page-${pageIndex}`, attempt, startedAt, "succeeded", route);
          return result;
        } catch (error) {
          this.recordFalAttempt(storybook, `${storybook.id}-page-${pageIndex}`, attempt, startedAt, "failed", route);
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Page repair failed");
    }

    this.costMeter.assertSpendAllowed({
      familyId: storybook.familyId,
      provider: baseRequest.provider,
      model: baseRequest.model,
      endpoint: baseRequest.endpoint,
    });
    if (this.fal.generatePageImage) {
      return this.fal.generatePageImage(baseRequest);
    }

    // Compatibility for adapters that predate the structured Page seam. This
    // branch is only for single-Persona/legacy fakes; current adapters implement
    // generatePageImage and never collapse multi-Persona input to one face.
    if (personaIds.length > 1) {
      throw new Error("Multi-Persona Page adapter is not configured");
    }
    return this.fal.generateImage(basePrompt, loras[0]?.path ?? "lora/default", {
      idempotencyKey: baseRequest.idempotencyKey,
    });
  }

  private buildPageWorkflowSteps(
    storybook: Storybook,
    pageData: { index: number; text: string },
    scene: { pageIndex: number; description: string; personaIds: string[] },
    personas: PersonaRecord[],
    story: GeneratedStory,
    attempt: number
  ): WorkflowStep[] {
    const pageIndex = pageData.index;
    const pageId = `${storybook.id}-page-${pageIndex}`;
    const blobKey = `books/${storybook.familyId}/${storybook.id}/page-${pageIndex}.png`;
    const rawKey = `${blobKey}.attempt-${attempt}.raw`;
    const prefix = `${storybook.id}/${pageIndex}/${attempt}`;
    const moderationKey = `${blobKey}.attempt-${attempt}.moderation`;
    const personaCount = scene.personaIds.length;
    const falIdempotencyKey = `${prefix}/fal-generate`;

    return [
      {
        name: `fal-gen-${pageIndex}`,
        idempotencyKey: `${prefix}/generate`,
        run: async () => {
          const startedAt = Date.now();
          let imageGenerationStarted = false;
          try {
            const existing = await this.blobs.get(rawKey);
            if (existing) return;

            imageGenerationStarted = true;
            const imageResult = await this.generatePageImageForAttempt(
              storybook,
              pageIndex,
              scene,
              personas,
              story,
              attempt,
              prefix
            );
            if (attempt === 0) {
              this.recordFalAttempt(storybook, pageId, attempt, startedAt, "succeeded");
            }

            const bytes =
              imageResult.bytes ?? Buffer.from(`fetched:${imageResult.imageUrl}`);
            await this.blobs.put(rawKey, bytes);
          } catch (err) {
            if (imageGenerationStarted && attempt === 0) {
              this.recordFalAttempt(storybook, pageId, attempt, startedAt, "failed");
            }
            // Issue 122: surface the upstream fal error (status/body) for
            // diagnosis instead of collapsing it to an opaque "failed". The
            // page still lands `failed` (a re-rollable hole) and the book
            // degrades to a text-viewable draft (issue 102); this `.error`
            // blob parallels the `.raw` key and is the diagnostic record only
            // — it is never read by the page state machine.
            await this.blobs.put(moderationKey, Buffer.from("failed"));
            await this.blobs.put(
              `${blobKey}.attempt-${attempt}.error`,
              Buffer.from(err instanceof Error ? err.message : String(err))
            );
          }
        },
      },
      {
        name: `moderate-${pageIndex}`,
        idempotencyKey: `${prefix}/moderate`,
        run: async () => {
          const prior = await this.blobs.get(moderationKey);
          if (prior) return;

          const bytes = await this.blobs.get(rawKey);
          if (!bytes) {
            await this.blobs.put(moderationKey, Buffer.from("failed"));
            return;
          }

          try {
            const mod = await this.childSafety.checkGeneratedImageBytes(
              bytes,
              `${storybook.id}/page-${pageIndex}`
            );
            await this.blobs.put(
              moderationKey,
              Buffer.from(mod === "quarantined" ? "quarantined" : "allowed")
            );
          } catch {
            await this.blobs.put(moderationKey, Buffer.from("failed"));
          }
        },
      },
      {
        name: `store-${pageIndex}`,
        idempotencyKey: `${prefix}/store`,
        run: async () => {
          const modOutcome = (await this.blobs.get(moderationKey))?.toString();
          if (modOutcome !== "allowed") return;

          const bytes = await this.blobs.get(rawKey);
          if (!bytes) return;

          await this.blobs.put(blobKey, bytes);
        },
      },
      ...(this.video
        ? [
            {
              name: `video-${pageIndex}`,
              idempotencyKey: `${prefix}/video`,
              run: async () => {
                const modOutcome = (await this.blobs.get(moderationKey))?.toString();
                if (modOutcome !== "allowed") return;
                // ADR-0023: video is a Plus-only, credit-metered feature. The
                // capability + credit gate (requireCapability("video") + ledger
                // debit, refund-on-failure) is enforced by issue 94's metering,
                // which owns the Plus-only boundary + the 2-included/credit
                // overage. The adapter is null in production (issue 91 leaves
                // the boundary to the metering layer, not this auto-step).
                const videoKey = `books/${storybook.familyId}/${storybook.id}/page-${pageIndex}.mp4`;
                if (await this.blobs.get(videoKey)) return;
                const result = await this.video!.generatePageClip(blobKey, pageData.text, {
                  idempotencyKey: `${prefix}/video-gen`,
                });
                const bytes =
                  result.bytes ?? Buffer.from(`fetched:${result.videoUrl}`);
                await this.blobs.put(videoKey, bytes);
              },
            } satisfies WorkflowStep,
          ]
        : []),
      {
        name: `persist-${pageIndex}`,
        idempotencyKey: `${prefix}/persist`,
        run: async () => {
          const modOutcome = (await this.blobs.get(moderationKey))?.toString() ?? "failed";
          let generationStatus: PageGenerationStatus = "failed";
          let illustrationBlobKey: string | null = null;
          let videoBlobKey: string | null = null;

          if (modOutcome === "allowed" && (await this.blobs.get(blobKey))) {
            generationStatus = "ready";
            illustrationBlobKey = blobKey;
            const videoKey = `books/${storybook.familyId}/${storybook.id}/page-${pageIndex}.mp4`;
            if (this.video && (await this.blobs.get(videoKey))) {
              videoBlobKey = videoKey;
            }
          } else if (modOutcome === "quarantined") {
            generationStatus = "quarantined";
          }

          this.store.savePage({
            id: pageId,
            storybookId: storybook.id,
            index: pageIndex,
            text: pageData.text,
            illustrationUrl: null,
            illustrationBlobKey,
            videoBlobKey,
            videoUrl: null,
            voiceClipId: this.getVoiceClipForPage(
              storybook.brief,
              pageIndex,
              resolvePageCount(storybook.brief)
            ),
            generationStatus,
            personaCount,
          });
          if (attempt > 0) {
            this.store.savePageCandidate({
              id: `${pageId}-recover-${attempt}`,
              pageId,
              kind: "image",
              content: illustrationBlobKey ?? `${blobKey}.attempt-${attempt}`,
              selected: generationStatus === "ready",
              createdAt: new Date(),
            });
          }
        },
      },
    ];
  }

  private async finalizeStorybookStatus(storybookId: string): Promise<void> {
    const storybook = this.store.storybooks.get(storybookId);
    if (!storybook) return;
    if (storybook.status !== "generating" && storybook.status !== "failed") return;

    const pages = this.store.getPagesForStorybook(storybookId);
    const readyCount = pages.filter((p) => p.generationStatus === "ready").length;
    const floor = readyPageFloor(resolvePageCount(storybook.brief));

    if (readyCount >= floor) {
      storybook.status = "draft";
    } else {
      // Issue 102: text-viewable fallback. When illustrations are unavailable
      // (fal/blob store down), every page lands `failed` for the image but the
      // generated story text is still present on each Page. A book with enough
      // text-bearing pages degrades to a readable text-viewable `draft` rather
      // than uniformly `failed` — the reader renders page text gracefully when
      // `illustrationBlobKey` is null. Only a book with NO text pages (claude
      // pass produced nothing) stays `failed`.
      const textPageCount = pages.filter((p) => p.text && p.text.length > 0).length;
      if (textPageCount >= floor) {
        storybook.status = "draft";
      } else {
        storybook.status = "failed";
      }
    }
    this.store.saveStorybook(storybook);
  }

  private countRecoveryAttempts(pageId: string): number {
    return [...this.store.pageCandidates.values()].filter(
      (c) => c.pageId === pageId && c.kind === "image" && c.id.includes("-recover-")
    ).length;
  }

  private countRerollAttempts(pageId: string): number {
    return [...this.store.pageCandidates.values()].filter(
      (c) => c.pageId === pageId && c.kind === "image" && c.id.includes("-reroll-")
    ).length;
  }

  rerollImage(memberId: string, pageId: string): void {
    const page = this.store.pages.get(pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");

    this.decrementRerollBudget(book);

    const attempt = this.countRerollAttempts(pageId) + 1;
    const candidate: import("@/domain/types").PageCandidate = {
      id: `${pageId}-reroll-${attempt}`,
      pageId,
      kind: "image",
      content: `https://example.com/reroll/${pageId}/${attempt}.png`,
      selected: false,
      createdAt: new Date(),
    };
    this.store.savePageCandidate(candidate);
  }

  rerollText(memberId: string, pageId: string, newText: string): void {
    const page = this.store.pages.get(pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");

    this.decrementRerollBudget(book);

    const attempt = this.countRerollAttempts(pageId) + 1;
    const candidate = {
      id: `${pageId}-reroll-text-${attempt}`,
      pageId,
      kind: "text" as const,
      content: newText,
      selected: false,
      createdAt: new Date(),
    };
    this.store.savePageCandidate(candidate);
  }

  async selectCandidate(memberId: string, candidateId: string): Promise<void> {
    const candidate = this.store.pageCandidates.get(candidateId);
    if (!candidate) throw new Error("Candidate not found");
    const page = this.store.pages.get(candidate.pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");

    for (const c of this.store.getCandidatesForPage(candidate.pageId)) {
      c.selected = c.id === candidateId;
      this.store.savePageCandidate(c);
    }

    if (candidate.kind === "image") {
      const res = await fetch(candidate.content);
      if (!res.ok) throw new Error("Failed to fetch illustration candidate");
      const bytes = Buffer.from(await res.arrayBuffer());
      await this.childSafety.checkUpload(bytes, `candidate-${candidateId}`);
      const blobKey = `${book.id}/pages/${page.id}/selected-${candidateId}.png`;
      await this.blobs.put(blobKey, bytes);
      page.illustrationBlobKey = blobKey;
      page.illustrationUrl = null;
    } else {
      page.text = candidate.content;
    }
    this.store.savePage(page);
  }

  buyRerollCredits(memberId: string, storybookId: string, credits: number): void {
    const book = this.store.getStorybook(storybookId, memberId);
    if (!book) throw new Error("Storybook not found");
    book.rerollCredits += credits;
    this.store.saveStorybook(book);
  }

  finalize(memberId: string, storybookId: string): Storybook {
    const book = this.store.getStorybook(storybookId, memberId);
    if (!book) throw new Error("Storybook not found");
    if (book.status !== "draft") throw new Error("Only drafts can be finalized");
    book.status = "finalized";
    book.finalizedAt = new Date();
    this.store.saveStorybook(book);
    // Issue 90: record a bounded continuity/anti-repeat summary for the Baby.
    this.pastStorySummary.recordFinalization(memberId, storybookId);
    return book;
  }

  private decrementRerollBudget(book: Storybook): void {
    if (book.rerollBudgetRemaining > 0) {
      book.rerollBudgetRemaining--;
    } else if (book.rerollCredits > 0) {
      book.rerollCredits--;
    } else {
      throw new Error("Re-roll budget exhausted; purchase credits");
    }
    this.store.saveStorybook(book);
  }
}
