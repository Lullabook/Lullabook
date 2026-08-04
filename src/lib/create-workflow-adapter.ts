import { optionalEnv } from "@/adapters/env";
import { FakeWorkflow } from "@/adapters/fakes";
import { InngestWorkflowAdapter } from "@/adapters/inngest";
import { createRequestContext } from "@/lib/context";
import {
  runPersonaCreateBody,
  type PersonaCreatePayload,
} from "@/workflows/persona-create-body";

/**
 * Issue 186: a production request reached Storybook generation with no usable
 * durable workflow dispatch. Production must fail closed with this typed
 * error BEFORE any provider spend — running Anthropic/fal inline in the HTTP
 * request is the exact behavior the async queue exists to prevent.
 */
export class WorkflowConfigurationError extends Error {
  readonly code = "workflow_not_configured";
  readonly status = 500;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowConfigurationError";
  }
}

/** A usable Inngest event key is non-empty after trimming whitespace. */
function usableEventKey(): string | undefined {
  return optionalEnv("INNGEST_EVENT_KEY")?.trim() || undefined;
}

/**
 * Runs storybook + persona jobs inline when Inngest Cloud isn't configured.
 * Keeps local dev clickable without INNGEST_EVENT_KEY (mirrors FakeWorkflow in tests).
 * Development-only: production without a usable key fails closed instead.
 */
export class LocalDevWorkflowAdapter extends FakeWorkflow {
  requestPersonaCreate(payload: PersonaCreatePayload): void {
    this.enqueue("persona-create", async () => {
      const ctx = createRequestContext();
      await ctx.store.hydrateByMemberId(payload.memberId);
      await runPersonaCreateBody(ctx, payload);
    });
  }

  async flush(): Promise<void> {
    await this.drain();
  }
}

/**
 * Production Inngest when a usable event key is configured; otherwise inline
 * local dev adapter. In production a missing/unusable key is a typed
 * configuration failure — never silent inline provider work in the request
 * (PRD v22 decision 4 / issue 186).
 */
export function createWorkflowAdapter(): InngestWorkflowAdapter | LocalDevWorkflowAdapter {
  if (usableEventKey()) {
    return new InngestWorkflowAdapter();
  }
  if (process.env.NODE_ENV === "production") {
    throw new WorkflowConfigurationError(
      "Production Storybook generation requires a durable workflow dispatch (INNGEST_EVENT_KEY); refusing to run provider work inline in the request."
    );
  }
  return new LocalDevWorkflowAdapter();
}
