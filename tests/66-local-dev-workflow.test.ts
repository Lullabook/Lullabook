import { describe, expect, it } from "vitest";
import { createWorkflowAdapter } from "@/lib/create-workflow-adapter";
import { LocalDevWorkflowAdapter } from "@/lib/create-workflow-adapter";

describe("local dev workflow without INNGEST_EVENT_KEY", () => {
  it("uses LocalDevWorkflowAdapter when event key is absent", () => {
    const prev = process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_EVENT_KEY;
    try {
      const adapter = createWorkflowAdapter();
      expect(adapter).toBeInstanceOf(LocalDevWorkflowAdapter);
    } finally {
      if (prev) process.env.INNGEST_EVENT_KEY = prev;
      else delete process.env.INNGEST_EVENT_KEY;
    }
  });

  it("flush drains enqueued storybook work inline", async () => {
    const adapter = new LocalDevWorkflowAdapter();
    let ran = false;
    adapter.enqueue("test-job", async () => {
      ran = true;
    });
    await adapter.flush();
    expect(ran).toBe(true);
  });
});
