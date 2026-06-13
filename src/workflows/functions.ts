import { EVENTS, inngest, type DurableStepTools } from "@/adapters/inngest";
import { createRequestContext } from "@/lib/context";

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
      // Terminal failure of the whole run: never strand a book in
      // `generating` — the UI treats `failed` as the re-rollable floor.
      const book = ctx.store.storybooks.get(storybookId);
      if (book && book.status === "generating") {
        book.status = "failed";
        ctx.store.storybooks.set(book.id, book);
        await ctx.store.sync();
      }
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

export interface PersonaCreatePayload {
  mode: "adult" | "baby" | "promote-character";
  memberId: string;
  displayName: string;
  characterId?: string;
  kind?: "baby" | "adult";
  /** Staged upload keys — the request handler stores bytes, events stay small. */
  photoKeys: string[];
  selfieKey?: string;
}

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
    const member = ctx.store.members.get(payload.memberId);

    const photos: Buffer[] = [];
    for (const key of payload.photoKeys) {
      const bytes = await ctx.blobs.get(key);
      if (!bytes) throw new Error(`Staged photo missing: ${key}`);
      photos.push(bytes);
    }
    const selfie = payload.selfieKey
      ? ((await ctx.blobs.get(payload.selfieKey)) ?? undefined)
      : undefined;

    try {
      await ctx.workflow.runWithStepContext(step as DurableStepTools, async () => {
        if (payload.mode === "promote-character") {
          await ctx.characters.promoteToPersona({
            characterId: payload.characterId!,
            memberId: payload.memberId,
            kind: payload.kind ?? "baby",
            photos,
            selfie,
          });
        } else if (payload.mode === "adult") {
          await ctx.personas.createAdult({
            memberId: payload.memberId,
            displayName: payload.displayName,
            photos,
            selfie,
          });
        } else {
          await ctx.personas.createBaby({
            memberId: payload.memberId,
            displayName: payload.displayName,
            photos,
          });
        }
      });
    } catch (err) {
      // Validation failures (selfie mismatch, pre-flight, moderation) happen
      // out-of-band — surface them by email rather than vanish silently.
      const failedPersona = [...ctx.store.personas.values()].find(
        (p) =>
          p.createdByMemberId === payload.memberId &&
          p.displayName === payload.displayName &&
          p.status === "training"
      );
      if (failedPersona) {
        failedPersona.status = "failed";
        ctx.store.savePersona(failedPersona);
      }
      if (member) {
        await ctx.notifications.sendEmail(
          member.email,
          "We couldn't create your character",
          err instanceof Error ? err.message : "Something went wrong."
        );
      }
      await ctx.persist();
      throw err;
    }

    // Staged uploads are transient; the service re-stored accepted photos
    // under the persona's own keys.
    for (const key of [...payload.photoKeys, payload.selfieKey ?? ""]) {
      if (key) await ctx.blobs.delete(key);
    }
    await ctx.persist();
  }
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
  scheduledPurges,
];
