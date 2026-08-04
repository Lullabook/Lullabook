import { describe, expect, it, vi } from "vitest";
import { createTestContext, householdWithBaby } from "@/test/fixtures";
import {
  createWorkflowAdapter,
  LocalDevWorkflowAdapter,
  WorkflowConfigurationError,
} from "@/lib/create-workflow-adapter";
import { InngestWorkflowAdapter, workflowEventFromPayload } from "@/adapters/inngest";

/**
 * Issue 186 — production composition of the Storybook generation queue.
 *
 * A production configuration without a usable durable workflow dispatch
 * (INNGEST_EVENT_KEY) fails CLOSED with a typed configuration failure before
 * the request can accept provider spend; local inline execution is explicit
 * and development-only. The durable event envelope never carries provider
 * credentials.
 */

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "guardian",
  ctxError: null as Error | null,
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => {
    if (harness.ctxError) throw harness.ctxError;
    return harness.ctx!;
  },
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async () => ({
      sub: harness.authSub,
      email: `${harness.authSub}@example.com`,
      jurisdiction: "US",
    }),
  }),
}));

import { GET, POST } from "@/app/api/storybooks/route";

const KEY = "INNGEST_EVENT_KEY";

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(env)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else (process.env as Record<string, string>)[name] = value;
  }
  try {
    fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else (process.env as Record<string, string>)[name] = value;
    }
  }
}

function bearerPost(): Request {
  return new Request("http://localhost/api/storybooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer good",
    },
    body: JSON.stringify({ starringPersonaIds: [], storyType: "bedtime", theme: "x" }),
  });
}

function bearerGet(): Request {
  return new Request("http://localhost/api/storybooks", {
    method: "GET",
    headers: { Authorization: "Bearer good" },
  });
}

describe("186 — production composition of the generation queue", () => {
  it("fails closed in production without a usable Inngest event key, with a typed configuration error", () => {
    withEnv({ NODE_ENV: "production", [KEY]: undefined }, () => {
      expect(() => createWorkflowAdapter()).toThrow(WorkflowConfigurationError);
    });
  });

  it("a whitespace-only event key is not usable and fails closed in production", () => {
    withEnv({ NODE_ENV: "production", [KEY]: "   " }, () => {
      expect(() => createWorkflowAdapter()).toThrow(WorkflowConfigurationError);
    });
  });

  it("inline execution stays explicit and development-only (no key outside production)", () => {
    withEnv({ NODE_ENV: "development", [KEY]: undefined }, () => {
      expect(createWorkflowAdapter()).toBeInstanceOf(LocalDevWorkflowAdapter);
    });
    withEnv({ NODE_ENV: "test", [KEY]: undefined }, () => {
      expect(createWorkflowAdapter()).toBeInstanceOf(LocalDevWorkflowAdapter);
    });
  });

  it("production with a usable key dispatches through the durable Inngest adapter", () => {
    withEnv({ NODE_ENV: "production", [KEY]: "inngest-event-key-186" }, () => {
      expect(createWorkflowAdapter()).toBeInstanceOf(InngestWorkflowAdapter);
    });
  });

  it("a production POST without durable dispatch fails closed BEFORE provider spend", async () => {
    const ctx = createTestContext();
    await householdWithBaby(ctx, "Maya");
    harness.authSub = "guardian";
    harness.ctx = ctx;
    harness.ctxError = new WorkflowConfigurationError(
      "Production Storybook generation requires a durable workflow dispatch (INNGEST_EVENT_KEY); refusing to run provider work inline in the request."
    );
    try {
      const res = await POST(bearerPost());
      expect(res.status).toBe(500);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("workflow_not_configured");
    } finally {
      harness.ctxError = null;
    }
    // The handler never ran: no provider call, no Storybook row, no reservation.
    expect(ctx.anthropic.calls).toHaveLength(0);
    expect(ctx.fal.imageCalls).toBe(0);
    expect(ctx.store.storybooks.size).toBe(0);
    expect(ctx.store.storyAllowanceReservations.size).toBe(0);
  });

  it("a production GET without durable dispatch also fails closed with the typed configuration error, not an unhandled crash", async () => {
    harness.authSub = "guardian";
    harness.ctxError = new WorkflowConfigurationError(
      "Production Storybook generation requires a durable workflow dispatch (INNGEST_EVENT_KEY); refusing to run provider work inline in the request."
    );
    try {
      const res = await GET(bearerGet());
      expect(res.status).toBe(500);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("workflow_not_configured");
    } finally {
      harness.ctxError = null;
    }
  });

  it("the durable event envelope carries only the job identity, never provider credentials", () => {
    const event = workflowEventFromPayload({
      type: "storybook-generate",
      storybookId: "book-186",
      memberId: "member-186",
    });
    expect(event).toMatchObject({
      id: "storybook-book-186",
      name: "lullabook/storybook.generate.requested",
      data: { type: "storybook-generate", storybookId: "book-186", memberId: "member-186" },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /api[_-]?key|secret|anthropic|fal[_-]?api|SUPABASE_SERVICE_ROLE_KEY/i
    );
  });
});
