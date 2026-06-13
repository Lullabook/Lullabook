import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFalAdapter } from "@/adapters/fal";
import { RealModerationAdapter } from "@/adapters/moderation";
import { RealNotificationAdapter } from "@/adapters/notifications";
import { InngestWorkflowAdapter, type DurableStepTools } from "@/adapters/inngest";

/**
 * Real-adapter contract tests, service-seam style: the network is faked at
 * `fetch`, and each test pins the observable behavior the services rely on
 * (idempotency forwarding, moderation layer ordering, fail-closed CSAM).
 */

type FetchCall = { url: string; init?: RequestInit };

function fetchSequence(responses: (object | Buffer)[]): {
  calls: FetchCall[];
  fetch: typeof fetch;
} {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = responses.shift();
    if (body === undefined) throw new Error("Unexpected extra fetch call");
    if (Buffer.isBuffer(body)) {
      return new Response(new Uint8Array(body), { status: 200 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}

beforeEach(() => {
  vi.stubEnv("FAL_API_KEY", "fal-test-key");
  vi.stubEnv("SIGHTENGINE_API_USER", "se-user");
  vi.stubEnv("SIGHTENGINE_API_SECRET", "se-secret");
  vi.stubEnv("RESEND_API_KEY", "resend-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("RealFalAdapter", () => {
  it("forwards the deterministic idempotency key and returns bytes", async () => {
    const png = Buffer.from("png-bytes");
    const { calls, fetch } = fetchSequence([
      { request_id: "req-1", status_url: "https://q/status", response_url: "https://q/result" },
      { status: "COMPLETED" },
      { images: [{ url: "https://fal/img.png" }] },
      png,
    ]);
    vi.stubGlobal("fetch", fetch);

    const result = await new RealFalAdapter().generateImage("a cozy scene", "lora/abc", {
      idempotencyKey: "book-1/3/1",
    });

    const submit = calls[0];
    expect(submit.url).toContain("fal-ai/flux-lora");
    expect((submit.init?.headers as Record<string, string>)["X-Fal-Idempotency-Key"]).toBe(
      "book-1/3/1"
    );
    const submitBody = JSON.parse(String(submit.init?.body));
    expect(submitBody.enable_safety_checker).toBe(true);
    expect(result.imageUrl).toBe("https://fal/img.png");
    expect(result.bytes?.toString()).toBe("png-bytes");
  });

  it("attaches the training webhook URL and returns the queued jobId", async () => {
    vi.stubEnv("FAL_WEBHOOK_URL", "https://app.example/api/webhooks/fal");
    const { calls, fetch } = fetchSequence([
      { request_id: "train-9", status_url: "s", response_url: "r" },
    ]);
    vi.stubGlobal("fetch", fetch);

    const job = await new RealFalAdapter().startTraining([Buffer.from("photo")]);

    expect(job).toEqual({ jobId: "train-9", status: "queued" });
    expect(calls[0].url).toContain("flux-lora-fast-training");
    expect(calls[0].url).toContain(
      `fal_webhook=${encodeURIComponent("https://app.example/api/webhooks/fal")}`
    );
  });

  it("runs sequential inpaint passes, each consuming the previous output", async () => {
    const { calls, fetch } = fetchSequence([
      { request_id: "r1", status_url: "s1", response_url: "p1" },
      { status: "COMPLETED" },
      { images: [{ url: "https://fal/pass1.png" }] },
      Buffer.from("b1"),
      { request_id: "r2", status_url: "s2", response_url: "p2" },
      { status: "COMPLETED" },
      { images: [{ url: "https://fal/pass2.png" }] },
      Buffer.from("b2"),
    ]);
    vi.stubGlobal("fetch", fetch);

    const result = await new RealFalAdapter().inpaintFaces("https://fal/base.png", [
      { region: "left", loraKey: "lora/a" },
      { region: "right", loraKey: "lora/b" },
    ]);

    expect(result.imageUrl).toBe("https://fal/pass2.png");
    const secondSubmit = JSON.parse(String(calls[4].init?.body));
    expect(secondSubmit.image_url).toBe("https://fal/pass1.png");
  });
});

describe("RealModerationAdapter", () => {
  it("CSAM hash match blocks with csamDetected before any classifier runs", async () => {
    vi.stubEnv("CSAM_HASH_API_URL", "https://csam.example/match");
    vi.stubEnv("CSAM_HASH_API_KEY", "csam-key");
    const { calls, fetch } = fetchSequence([{ match: true }]);
    vi.stubGlobal("fetch", fetch);

    const result = await new RealModerationAdapter().checkImage(Buffer.from("img"));

    expect(result.allowed).toBe(false);
    expect(result.csamDetected).toBe(true);
    expect(calls).toHaveLength(1); // Sightengine never consulted
  });

  it("fails closed when the CSAM hash service is down", async () => {
    vi.stubEnv("CSAM_HASH_API_URL", "https://csam.example/match");
    vi.stubEnv("CSAM_HASH_API_KEY", "csam-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("outage", { status: 503 }))
    );

    await expect(
      new RealModerationAdapter().checkImage(Buffer.from("img"))
    ).rejects.toThrow(/CSAM hash-match service failed/);
  });

  it("allows a clean image via the classifier layer", async () => {
    const { fetch } = fetchSequence([
      { status: "success", nudity: { sexual_activity: 0, sexual_display: 0, erotica: 0, suggestive: 0.1 }, offensive: { prob: 0 }, gore: { prob: 0 } },
    ]);
    vi.stubGlobal("fetch", fetch);

    const result = await new RealModerationAdapter().checkImage(Buffer.from("img"));
    expect(result.allowed).toBe(true);
  });

  it("blocks unsafe text by moderation class score", async () => {
    const { fetch } = fetchSequence([
      { status: "success", moderation_classes: { available: "x", sexual: 0.9 } },
    ]);
    vi.stubGlobal("fetch", fetch);

    const result = await new RealModerationAdapter().checkText("bad text");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("sexual");
  });

  it("fails closed on a non-numeric moderation class score", async () => {
    const { fetch } = fetchSequence([
      { status: "success", moderation_classes: { available: "x", sexual: "0.9" } },
    ]);
    vi.stubGlobal("fetch", fetch);

    const result = await new RealModerationAdapter().checkText("bad text");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("invalid score");
  });
});

describe("RealNotificationAdapter", () => {
  it("sends email through Resend and treats push without subscriptions as a no-op", async () => {
    const { calls, fetch } = fetchSequence([{ id: "email-1" }]);
    vi.stubGlobal("fetch", fetch);

    const adapter = new RealNotificationAdapter();
    await adapter.sendEmail("parent@example.com", "Your persona is ready", "~5 minutes");
    await adapter.sendWebPush("member-1", "Persona ready", "Training complete");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.to).toEqual(["parent@example.com"]);
    expect(body.subject).toBe("Your persona is ready");
  });
});

describe("InngestWorkflowAdapter", () => {
  it("refuses to enqueue without a serializable payload", () => {
    const adapter = new InngestWorkflowAdapter();
    expect(() => adapter.enqueue("job", async () => {})).toThrow(/serializable payload/);
  });

  it("maps steps onto durable step.run with their idempotency keys and syncs after each commit", async () => {
    const adapter = new InngestWorkflowAdapter();
    const ran: string[] = [];
    const committed: string[] = [];
    const step: DurableStepTools = {
      async run(id, fn) {
        ran.push(id);
        return fn();
      },
      async waitForEvent() {
        return { data: {} };
      },
    };
    adapter.onStepCommitted = async () => {
      committed.push(ran[ran.length - 1] ?? "wait");
    };

    const order: string[] = [];
    await adapter.runWithStepContext(step, () =>
      adapter.run([
        { name: "claude-pass", idempotencyKey: "book-1/claude", run: async () => void order.push("a") },
        { name: "fal-gen-0", idempotencyKey: "book-1/0/1/fal", run: async () => void order.push("b") },
      ])
    );

    expect(order).toEqual(["a", "b"]);
    expect(ran).toEqual(["book-1/claude", "book-1/0/1/fal"]);
    expect(committed).toHaveLength(2);
  });

  it("never wraps wait-* steps in step.run (nested step tools are forbidden)", async () => {
    const adapter = new InngestWorkflowAdapter();
    const wrapped: string[] = [];
    const step: DurableStepTools = {
      async run(id, fn) {
        wrapped.push(id);
        return fn();
      },
      async waitForEvent() {
        return { data: { status: "ready" } };
      },
    };

    let waited = false;
    await adapter.runWithStepContext(step, () =>
      adapter.run([
        {
          name: "wait-for-training",
          idempotencyKey: "wait-for-training:job-1",
          run: async () => {
            waited = true;
          },
        },
      ])
    );

    expect(waited).toBe(true);
    expect(wrapped).toHaveLength(0);
  });
});
