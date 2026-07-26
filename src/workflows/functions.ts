import { EVENTS, InngestWorkflowAdapter, inngest, type DurableStepTools } from "@/adapters/inngest";
import type { BlobStore, PersonaCreatePayload, WorkflowAdapter, WorkflowJobPayload } from "@/adapters/types";
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
  personaCreate,
  personaCreationFinalized,
  personaCreationRecovery,
  scheduledPurges,
];
