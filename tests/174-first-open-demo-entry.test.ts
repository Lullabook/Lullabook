// Issue 174 (FAIL-5, PERF-4) — First-open Demo Story + 5-step entry flow.
//
// x Bundled demo Story (mobile, offline) mirrors the server canonical one —
//   drift fails here, not on a device.
// x FAIL-5: unrenderable demo skips to paywall/sign-up, never a white screen.
// x Entry routing is a pure function (no RN) so the funnel order
//   demo → signup → trial → consent → photos is enforceable in CI.

import { describe, expect, it } from "vitest";

import {
  DEMO_STORY as BUNDLED_DEMO,
  isRenderableDemoStory,
} from "../mobile/lib/demo-story";
import { resolveFirstOpenRoute } from "../mobile/lib/first-open";
import { DemoStoryService, FirstOpenService } from "../src/services/first-open";

describe("174 — bundled demo Story mirrors the server canonical demo", () => {
  it("is byte-identical (PERF-4: offline bundle can never drift silently)", () => {
    const server = new DemoStoryService().getDemoStory();
    expect(BUNDLED_DEMO).toEqual(server);
  });

  it("is baby-free and gate-free (COPPA: no real child before consent)", () => {
    expect(BUNDLED_DEMO.isBabyFree).toBe(true);
    expect(BUNDLED_DEMO.requiresSignup).toBe(false);
    expect(BUNDLED_DEMO.requiresCard).toBe(false);
    expect(BUNDLED_DEMO.characters.every((c) => c.isFictional)).toBe(true);
  });
});

describe("174 — FAIL-5 renderability guard", () => {
  it("accepts the bundled story", () => {
    expect(isRenderableDemoStory(BUNDLED_DEMO)).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "story"],
    ["empty object", {}],
    ["empty title", { ...BUNDLED_DEMO, title: "" }],
    ["no pages", { ...BUNDLED_DEMO, pages: [] }],
    ["page with empty text", { ...BUNDLED_DEMO, pages: [{ text: "", illustrationSeed: "x" }] }],
    ["page with null text", { ...BUNDLED_DEMO, pages: [{ text: null, illustrationSeed: "x" }] }],
    ["pages not an array", { ...BUNDLED_DEMO, pages: "four" }],
  ])("rejects %s", (_label, bad) => {
    expect(isRenderableDemoStory(bad)).toBe(false);
  });
});

describe("174 — first-open entry routing (demo → signup → trial → consent → photos)", () => {
  it("cold first open with a renderable demo lands on /demo", () => {
    expect(
      resolveFirstOpenRoute({ hasSession: false, hasSeenDemo: false, demoRenderable: true })
    ).toBe("/demo");
  });

  it("FAIL-5: unrenderable demo skips straight to sign-up — never a white screen", () => {
    expect(
      resolveFirstOpenRoute({ hasSession: false, hasSeenDemo: false, demoRenderable: false })
    ).toBe("/sign-up");
  });

  it("returning signed-out user who already saw the demo goes to sign-up, not demo again", () => {
    expect(
      resolveFirstOpenRoute({ hasSession: false, hasSeenDemo: true, demoRenderable: true })
    ).toBe("/sign-up");
  });

  it("a session always wins: straight to the app, demo state irrelevant", () => {
    for (const hasSeenDemo of [true, false]) {
      for (const demoRenderable of [true, false]) {
        expect(
          resolveFirstOpenRoute({ hasSession: true, hasSeenDemo, demoRenderable })
        ).toBe("/(tabs)");
      }
    }
  });
});

describe("174 — server flow order stays canonical", () => {
  it("getFlow() is demo → signup → paywall → consent → photos, annual default", () => {
    const flow = new FirstOpenService().getFlow();
    expect(flow.steps.map((s) => s.type)).toEqual([
      "demo",
      "signup",
      "paywall",
      "consent",
      "photos",
    ]);
    expect(flow.defaultBilling).toBe("annual");
    expect(flow.canSkipToPaywall).toBe(false);
  });

  it("onDemoFailed() drops only the demo step and unlocks skip-to-paywall", () => {
    const flow = new FirstOpenService().onDemoFailed();
    expect(flow.steps.map((s) => s.type)).toEqual(["demo", "paywall", "consent", "photos"]);
    expect(flow.canSkipToPaywall).toBe(true);
    expect(flow.hasUsableState).toBe(true);
  });
});
