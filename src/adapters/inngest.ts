import { AsyncLocalStorage } from "node:async_hooks";
import { Inngest } from "inngest";
import type {
  PersonaCreatePayload,
  WorkflowAdapter,
  WorkflowJobPayload,
  WorkflowStep,
} from "@/adapters/types";

// DECISION: Inngest (over Trigger.dev) as the durable workflow platform —
// first-class Next.js serve handler, per-step memoization that maps directly
// onto the per-Page step model, and event-match `waitForEvent` for the fal
// training webhook (ADR-0011).
const eventKey = process.env.INNGEST_EVENT_KEY;
export const inngest = new Inngest({
  id: "lullabook",
  ...(eventKey ? { eventKey } : {}),
});

export const EVENTS = {
  storybookGenerateRequested: "lullabook/storybook.generate.requested",
  pageRecoverRequested: "lullabook/page.recover.requested",
  personaCreationFinalized: "lullabook/persona-creation.finalized",
  personaCreateRequested: "lullabook/persona.create.requested",
  falTrainingComplete: "lullabook/fal.training.complete",
} as const;

/** Build the durable event envelope; Persona outbox UUIDs are Inngest dedupe IDs. */
export function workflowEventFromPayload(payload: WorkflowJobPayload) {
  const name = payload.type === "storybook-generate"
    ? EVENTS.storybookGenerateRequested
    : payload.type === "page-recover"
      ? EVENTS.pageRecoverRequested
      : EVENTS.personaCreationFinalized;
  if (payload.type === "persona-creation-finalized") {
    return { id: payload.eventId, name, data: payload };
  }
  if (payload.type === "storybook-generate") {
    return { id: `storybook-${payload.storybookId}`, name, data: payload };
  }
  return { name, data: payload };
}

/**
 * The subset of Inngest's step tools the adapter needs — kept structural so
 * the adapter does not chase the SDK's generics across versions.
 */
export interface DurableStepTools {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  waitForEvent(
    id: string,
    opts: { event: string; if: string; timeout: string }
  ): Promise<{ data: unknown } | null>;
}

const stepStorage = new AsyncLocalStorage<DurableStepTools>();

/**
 * Real durable workflow adapter (thin request / fat workflow, ADR-0011).
 *
 * - `enqueue` (called from the request path) sends an Inngest event carrying
 *   the serializable job payload; the closure is ignored — the Inngest
 *   function re-enters the same service body from persisted state.
 * - `run` (called from inside the workflow body) maps each WorkflowStep onto
 *   `step.run(idempotencyKey)`, so a successful step is memoized and never
 *   re-executed on an at-least-once replay. All keys are deterministic
 *   (`{storybookId}/{pageIndex}/{attempt}/…`) — no uuid()/Date.now() inside
 *   the workflow.
 */
export class InngestWorkflowAdapter implements WorkflowAdapter {
  private pendingSends: Promise<unknown>[] = [];

  /**
   * Set by the Inngest function to `store.sync()`: a memoized step's writes
   * must be durable in Postgres before the run can advance, otherwise a crash
   * between steps would replay into a store that never saw the step's output.
   */
  onStepCommitted?: () => Promise<void>;

  requestPersonaCreate(payload: PersonaCreatePayload): void {
    this.pendingSends.push(
      inngest.send({ name: EVENTS.personaCreateRequested, data: payload })
    );
  }

  enqueue(name: string, _work: () => Promise<void>, payload?: WorkflowJobPayload): void {
    if (!payload) {
      throw new Error(
        `Cannot enqueue "${name}" durably without a serializable payload`
      );
    }
    // enqueue() is synchronous at the port; the send promise is collected and
    // awaited by the request handler via flush() before it responds.
    this.pendingSends.push(inngest.send(workflowEventFromPayload(payload)));
  }

  /** Await all event sends issued by enqueue() in this request. */
  async flush(): Promise<void> {
    const pending = this.pendingSends.splice(0);
    await Promise.all(pending);
  }

  async run(steps: WorkflowStep[]): Promise<void> {
    const step = stepStorage.getStore();
    for (const s of steps) {
      if (!step) {
        // Outside a durable context (unit tests wire the fake instead; this
        // path only exists so local scripts cannot deadlock).
        await s.run();
        continue;
      }
      await step.run(s.idempotencyKey ?? s.name, async () => {
        await s.run();
        // Persist inside the memoized unit. If persistence crashes, Inngest
        // must replay the idempotent step instead of memoizing an undurable write.
        if (this.onStepCommitted) await this.onStepCommitted();
      });
    }
  }

  async waitForEvent<T>(eventName: string, matchId: string): Promise<T> {
    const step = stepStorage.getStore();
    if (!step) {
      throw new Error("waitForEvent requires a durable workflow context");
    }
    const evt = await step.waitForEvent(`wait-${eventName}-${matchId}`, {
      event: `lullabook/${eventName}`,
      if: `async.data.jobId == "${matchId}"`,
      timeout: "2h",
    });
    if (!evt) {
      throw new Error(`Timed out waiting for ${eventName}:${matchId}`);
    }
    return evt.data as T;
  }

  async emitEvent<T>(eventName: string, data: T): Promise<void> {
    await inngest.send({ name: `lullabook/${eventName}`, data: data as Record<string, unknown> });
  }

  /** Bind Inngest's step tools for the duration of a workflow body. */
  runWithStepContext<T>(step: DurableStepTools, fn: () => Promise<T>): Promise<T> {
    return stepStorage.run(step, fn);
  }
}
