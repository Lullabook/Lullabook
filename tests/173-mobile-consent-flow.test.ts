/**
 * Issue 173 (ADR-0018, FAIL-4, SEC-4) — mobile Email-Plus consent flow.
 *
 * Drives ConsentFlowController directly (dependency-free, same pattern as
 * tests/170-purchase-controller.test.ts) and source-checks the live wiring
 * in mobile/app/consent.tsx so the screen can't silently drop the SEC-4
 * fail-closed guarantees.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConsentFlowController,
  type ConsentFlowDeps,
  type ConsentStatusWire,
} from "../mobile/lib/consent-flow";

function makeDeps(overrides: Partial<ConsentFlowDeps> = {}): ConsentFlowDeps {
  return {
    requestConsent: async () => ({ status: "pending" }),
    fetchStatus: async (): Promise<ConsentStatusWire> => ({ status: "none" }),
    ...overrides,
  };
}

describe("173 — consent flow state machine", () => {
  it("starts at attest", () => {
    const c = new ConsentFlowController(makeDeps());
    expect(c.state).toEqual({ step: "attest" });
  });

  it("send happy path: sending → pending, email preserved", async () => {
    const calls: string[] = [];
    const c = new ConsentFlowController(
      makeDeps({
        requestConsent: async (email) => {
          calls.push(email);
          return { status: "pending" };
        },
      }),
    );
    const seen: string[] = [];
    c.subscribe((s) => seen.push(s.step));
    const end = await c.send("  parent@example.com  ");
    expect(end).toEqual({ step: "pending", email: "parent@example.com" });
    expect(calls).toEqual(["parent@example.com"]); // trimmed before wire
    expect(seen).toEqual(["sending", "pending"]);
  });

  it("FAIL-4: send failure lands on send_failed with email kept for retry, never pending", async () => {
    const c = new ConsentFlowController(
      makeDeps({
        requestConsent: async () => {
          throw new Error("Resend is down");
        },
      }),
    );
    const end = await c.send("parent@example.com");
    expect(end).toEqual({
      step: "send_failed",
      email: "parent@example.com",
      error: "Resend is down",
    });
  });

  it("rejects malformed emails locally without hitting the wire", async () => {
    let hit = false;
    const c = new ConsentFlowController(
      makeDeps({
        requestConsent: async () => {
          hit = true;
          return { status: "pending" };
        },
      }),
    );
    const end = await c.send("not-an-email");
    expect(end.step).toBe("send_failed");
    expect(hit).toBe(false);
  });

  it("SEC-4: poll only advances on server 'verified' — 'pending'/'none' never regress or advance", async () => {
    let wire: ConsentStatusWire = { status: "pending", email: "p@e.com" };
    const c = new ConsentFlowController(
      makeDeps({ fetchStatus: async () => wire }),
    );
    await c.send("p@e.com");
    expect(c.state.step).toBe("pending");

    await c.poll();
    expect(c.state.step).toBe("pending"); // still pending

    wire = { status: "none" };
    await c.poll();
    expect(c.state.step).toBe("pending"); // poll never regresses

    wire = { status: "verified" };
    const end = await c.poll();
    expect(end).toEqual({ step: "verified" });
  });

  it("SEC-4: poll errors keep the current step (no fabricated verification)", async () => {
    const c = new ConsentFlowController(
      makeDeps({
        fetchStatus: async () => {
          throw new Error("network");
        },
      }),
    );
    await c.send("p@e.com");
    const end = await c.poll();
    expect(end.step).toBe("pending");
  });

  it("resume() re-derives each step from server truth", async () => {
    for (const [wire, step] of [
      [{ status: "verified" }, "verified"],
      [{ status: "pending", email: "p@e.com" }, "pending"],
      [{ status: "none" }, "attest"],
    ] as Array<[ConsentStatusWire, string]>) {
      const c = new ConsentFlowController(
        makeDeps({ fetchStatus: async () => wire }),
      );
      expect((await c.resume()).step).toBe(step);
    }
  });

  it("resume() fetch failure lands on attest, never a dead end", async () => {
    const c = new ConsentFlowController(
      makeDeps({
        fetchStatus: async () => {
          throw new Error("offline");
        },
      }),
    );
    expect(await c.resume()).toEqual({ step: "attest" });
  });

  it("pending keeps server-reported email for the resume UI (null when absent)", async () => {
    const c = new ConsentFlowController(
      makeDeps({ fetchStatus: async () => ({ status: "pending" }) }),
    );
    expect(await c.resume()).toEqual({ step: "pending", email: null });
  });

  it("unsubscribe stops notifications", async () => {
    const c = new ConsentFlowController(makeDeps());
    let n = 0;
    const off = c.subscribe(() => n++);
    off();
    await c.send("p@e.com");
    expect(n).toBe(0);
  });
});

describe("173 — consent.tsx live wiring (source checks)", () => {
  const src = readFileSync(
    path.join(__dirname, "..", "mobile", "app", "consent.tsx"),
    "utf8",
  );
  const apiSrc = readFileSync(
    path.join(__dirname, "..", "mobile", "lib", "api.ts"),
    "utf8",
  );

  it("uses the ConsentFlowController (no ad-hoc state machine)", () => {
    expect(src).toContain("ConsentFlowController");
  });

  it("wires the controller to the api helpers", () => {
    expect(src).toContain("fetchEmailPlusConsentStatus");
    expect(src).toContain("requestEmailPlusConsent");
  });

  it("api helpers hit the server-authoritative endpoints", () => {
    expect(apiSrc).toContain("/api/consent/email-plus/status");
    expect(apiSrc).toContain("/api/consent/email-plus/request");
  });

  it("never marks verified client-side (only controller steps drive the UI)", () => {
    // The screen must not fabricate a verified step; only render on it.
    expect(src).not.toMatch(/set\w*\(\s*\{\s*step:\s*["']verified["']/);
  });
});
