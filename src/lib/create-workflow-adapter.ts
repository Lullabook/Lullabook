import { optionalEnv } from "@/adapters/env";
import { FakeWorkflow } from "@/adapters/fakes";
import { InngestWorkflowAdapter } from "@/adapters/inngest";
import { createRequestContext } from "@/lib/context";
import {
  runPersonaCreateBody,
  type PersonaCreatePayload,
} from "@/workflows/persona-create-body";

/**
 * Runs storybook + persona jobs inline when Inngest Cloud isn't configured.
 * Keeps local dev clickable without INNGEST_EVENT_KEY (mirrors FakeWorkflow in tests).
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

/** Production Inngest when configured; otherwise inline local dev adapter. */
export function createWorkflowAdapter(): InngestWorkflowAdapter | LocalDevWorkflowAdapter {
  if (optionalEnv("INNGEST_EVENT_KEY")) {
    return new InngestWorkflowAdapter();
  }
  return new LocalDevWorkflowAdapter();
}
