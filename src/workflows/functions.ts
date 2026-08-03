import { EVENTS, InngestWorkflowAdapter, inngest, type DurableStepTools } from "@/adapters/inngest";
import type { BlobStore, PersonaCreatePayload, WorkflowAdapter, WorkflowJobPayload } from "@/adapters/types";
import { FAL_NANO_BANANA_2_EDIT_ENDPOINT } from "@/adapters/fal";
import { getProductionStoryModel } from "@/adapters/anthropic";
import {
  PersonaCreationOutboxConsumer,
  PersonaCreationOutboxDispatcher,
  PersonaCreationRecovery,
  SupabasePersonaCreationRepository,
  SupabasePersonaCreationWorkerRepository,
  type PersonaCreationWorkerRepository,
} from "@/db/persona-creation-protocol";
import { createServiceClient } from "@/lib/supabase";
import { createRequestContext } from "@/lib/context";
import { createBlobStore } from "@/lib/create-blob-store";
import { estimateProviderCostUsd, TEXT_WORST_CASE_UNITS } from "@/lib/provider-prices";
import {
  CostThreshold,
  ProviderCostMeteringService,
  SpendBlockedError,
  type SpendRoute,
} from "@/services/provider-cost-metering";
import { runPersonaCreationFinalizedBody } from "@/workflows/persona-creation-finalized-body";
import { runPersonaCreateBody } from "@/workflows/persona-create-body";

/**
 * Durable workflow functions (thin request / fat workflow, ADR-0011).
 *
 * Each function is a fresh unit of work: hydrate the Family, bind Inngest's
 * step tools, re-enter the same service body the tests exercise, and sync
 * the store after every committed step (`onStepCommitted`) so a crash
 * between steps replays against state that already contains the committed
 * steps' writes.
 */

interface GeneratePayload {
  storybookId: string;
  memberId: string;
}

export interface PayableRunAuthorization {
  threshold: CostThreshold;
  pricingVersion: string;
  estimatedCostUsd: number;
}

/**
 * Issue 190 — additive composition guard: authorize a payable run BEFORE it
 * enters any provider boundary. Enforces persisted red kill switches
 * (global/provider/model/endpoint) plus the full-cap/P95 margin floor, with
 * margin evidence derived from the Family's subscription revenue and
 * attributable ledger COGS. Missing margin evidence fails closed
 * (SpendBlockedError). Returns the versioned worst-case price-table estimate
 * for the run's first provider route.
 */
export function authorizePayableRun(
  costMeter: ProviderCostMeteringService,
  input: { familyId: string; route: SpendRoute; units: Record<string, number> }
): PayableRunAuthorization {
  if (!input.route.endpoint) {
    throw new Error("authorizePayableRun requires an endpoint on the payable route");
  }
  const price = estimateProviderCostUsd({
    provider: input.route.provider,
    endpoint: input.route.endpoint,
    model: input.route.model,
    units: input.units,
  });
  const threshold = costMeter.authorizeSpend({
    provider: input.route.provider,
    endpoint: input.route.endpoint,
    model: input.route.model,
    familyId: input.familyId,
    marginEvidence: costMeter.deriveMarginEvidence(input.familyId) ?? undefined,
  });
  return { threshold, pricingVersion: price.pricingVersion, estimatedCostUsd: price.estimatedCostUsd };
}

export const storybookGenerate = inngest.createFunction(
  {
    id: "storybook-generate",
    retries: 3,
    triggers: { event: EVENTS.storybookGenerateRequested },
  },
  async ({ event, step }) => {
    const { storybookId, memberId } = event.data as unknown as GeneratePayload;
    const ctx = createRequestContext();
    await ctx.store.hydrateByMemberId(memberId);
    ctx.workflow.onStepCommitted = () => ctx.store.sync();

    try {
      const book = ctx.store.storybooks.get(storybookId);
      if (book) {
        // Issue 190: the run's first payable boundary is the Anthropic text
        // pass; everything downstream (image/moderation/storage/retry/repair)
        // is authorized as part of this run gate.
        authorizePayableRun(new ProviderCostMeteringService(ctx.store), {
          familyId: book.familyId,
          route: {
            provider: "anthropic",
            endpoint: "messages.create",
            model: getProductionStoryModel(),
          },
          units: { ...TEXT_WORST_CASE_UNITS },
        });
      }
      await ctx.workflow.runWithStepContext(step as DurableStepTools, () =>
        ctx.storybooks.runGenerationBody(memberId, storybookId)
      );
    } catch (err) {
      // Issue 100: the service backstop (runGenerationBody) already forces the
      // book to `failed` if still `generating`. This is defense-in-depth (mark
      // `failed` if the service backstop was somehow bypassed) AND the persist:
      // the in-memory map is terminal, but Postgres must not strand the book,
      // so always sync before re-throwing.
      const book = ctx.store.storybooks.get(storybookId);
      if (book && book.status === "generating") {
        // Issue 190: when the spend gate blocked the run, runGenerationBody
        // never ran, so its release seam did not fire. The stranded reservation
        // must not hold the Family allowance slot (release is idempotent).
        if (err instanceof SpendBlockedError) ctx.storyCap.release(storybookId);
        book.status = "failed";
        ctx.store.storybooks.set(book.id, book);
      }
      await ctx.store.sync();
      throw err;
    }
    await ctx.persist();
  }
);

interface RecoverPayload {
  pageId: string;
  memberId: string;
  attempt: number;
}

export const pageRecover = inngest.createFunction(
  {
    id: "page-recover",
    retries: 3,
    triggers: { event: EVENTS.pageRecoverRequested },
  },
  async ({ event, step }) => {
    const { pageId, memberId, attempt } = event.data as unknown as RecoverPayload;
    const ctx = createRequestContext();
    await ctx.store.hydrateByMemberId(memberId);
    ctx.workflow.onStepCommitted = () => ctx.store.sync();

    try {
      const page = ctx.store.pages.get(pageId);
      const book = page ? ctx.store.storybooks.get(page.storybookId) : undefined;
      if (book) {
        // Issue 190: page repair is payable fal spend; authorize before the
        // run enters the repair route (the cheap edit route is the first
        // attempt; escalation to the pro route re-checks inside the service).
        authorizePayableRun(new ProviderCostMeteringService(ctx.store), {
          familyId: book.familyId,
          route: {
            provider: "fal.ai",
            endpoint: FAL_NANO_BANANA_2_EDIT_ENDPOINT,
            // Matches StorybookService's canonical cheap repair route.
            model: "Nano Banana 2 Edit",
          },
          units: { images: 1 },
        });
      }
      await ctx.workflow.runWithStepContext(step as DurableStepTools, () =>
        ctx.storybooks.runRecoveryBody(memberId, pageId, attempt)
      );
    } catch (err) {
      const page = ctx.store.pages.get(pageId);
      if (page && page.generationStatus !== "ready") {
        page.generationStatus = "failed";
        ctx.store.savePage(page);
        const book = ctx.store.storybooks.get(page.storybookId);
        if (book && (book.status === "generating" || book.status === "failed")) {
          const pages = ctx.store.getPagesForStorybook(book.id);
          const readyCount = pages.filter((p) => p.generationStatus === "ready").length;
          book.status = readyCount >= 10 ? "draft" : "failed";
          ctx.store.saveStorybook(book);
        }
      }
      await ctx.store.sync();
      throw err;
    }
    await ctx.persist();
  }
);

export type { PersonaCreatePayload };

export const personaCreate = inngest.createFunction(
  {
    id: "persona-create",
    retries: 1,
    triggers: { event: EVENTS.personaCreateRequested },
  },
  async ({ event, step }) => {
    const payload = event.data as unknown as PersonaCreatePayload;
    const ctx = createRequestContext();
    await ctx.store.hydrateByMemberId(payload.memberId);
    ctx.workflow.onStepCommitted = () => ctx.store.sync();

    await ctx.workflow.runWithStepContext(step as DurableStepTools, async () => {
      await runPersonaCreateBody(ctx, payload);
    });
  }
);

export const personaCreationFinalized = inngest.createFunction(
  {
    id: "persona-creation-finalized",
    retries: 3,
    triggers: { event: EVENTS.personaCreationFinalized },
  },
  async ({ event, step }) => {
    const payload = event.data as WorkflowJobPayload;
    if (payload.type !== "persona-creation-finalized") {
      throw new Error("Unexpected Persona creation event payload");
    }
    const ctx = createRequestContext();
    ctx.workflow.onStepCommitted = () => ctx.store.sync();
    const serviceClient = createServiceClient();
    const repository = new SupabasePersonaCreationRepository(serviceClient, serviceClient);
    const consumer = new PersonaCreationOutboxConsumer(repository, ctx.workflow, async (creation) => {
      // The event carries only a lookup key at this trust boundary. Family,
      // Persona, reservation, and source keys all come from the committed row.
      await ctx.store.hydrateFamily(creation.familyId);
      await runPersonaCreationFinalizedBody(ctx, {
        eventId: creation.outboxEventId,
        familyId: creation.familyId,
        personaId: creation.personaId,
        reservationId: creation.id,
      }, creation.photoKeys);
    });
    await ctx.workflow.runWithStepContext(step as DurableStepTools, () =>
      consumer.consume(payload.eventId),
    );
  },
);

export async function runPersonaCreationRecoveryWorker(input: {
  repository: PersonaCreationWorkerRepository;
  blobs: BlobStore;
  workflow: WorkflowAdapter;
  limit?: number;
}): Promise<{ cleaned: number; dispatched: number }> {
  const limit = input.limit ?? 25;
  const cleaned = await new PersonaCreationRecovery(input.repository, input.blobs).reconcile(limit);
  const dispatcher = new PersonaCreationOutboxDispatcher(input.repository, input.workflow);
  let dispatched = 0;
  while (dispatched < limit && await dispatcher.dispatchOne(60)) dispatched += 1;
  return { cleaned, dispatched };
}

export const personaCreationRecovery = inngest.createFunction(
  {
    id: "persona-creation-recovery",
    retries: 3,
    triggers: { cron: "*/2 * * * *" },
  },
  async () => {
    const repository = new SupabasePersonaCreationWorkerRepository(createServiceClient());
    return runPersonaCreationRecoveryWorker({
      repository,
      blobs: createBlobStore(),
      workflow: new InngestWorkflowAdapter(),
      limit: 25,
    });
  },
);

export const scheduledPurges = inngest.createFunction(
  { id: "scheduled-purges", triggers: { cron: "0 3 * * *" } },
  async () => {
    // Export-then-purge (ADR-0007): each due Family gets its own unit of
    // work so one failure cannot block another family's purge.
    const due = await createRequestContext().store.listPurgeDueFamilyIds();
    const purged: string[] = [];
    for (const familyId of due) {
      const ctx = createRequestContext();
      await ctx.store.hydrateFamily(familyId);
      const ids = await ctx.hardDelete.runScheduledPurges();
      await ctx.persist();
      purged.push(...ids);
    }
    return { purged };
  }
);

export const workflowFunctions = [
  storybookGenerate,
  pageRecover,
  personaCreationFinalized,
  personaCreationRecovery,
  scheduledPurges,
];
