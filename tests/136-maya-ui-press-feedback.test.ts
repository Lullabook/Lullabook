import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Issue 136 — Centralize touch feedback + haptics in maya-ui.
 *
 * The acceptance criteria have three testable seams:
 *  1. Haptics fire on primary CTAs / chip toggles / tab switches.
 *  2. Haptics **no-op when unavailable** (older sim / setting off / SDK unreachable).
 *  3. Reduce-motion is respected (spring disabled when on).
 *
 * The repo's test environment is server-side Vitest (`environment: "node"`)
 * with no React Native renderer — see `vitest.config.ts` (include pattern) and
 * the absence of any `*.test.tsx` under `tests/`. Per the project's adapter
 * convention (e.g. `selectFalAdapter` in `src/lib/dev-bypass.ts`), the testable
 * decision logic lives behind a `HapticsAdapter` seam so it can be exercised
 * without a RN runtime. The component wiring is type-checked via
 * `(cd mobile && npx tsc --noEmit)` (the issue's Verification-command).
 */
describe("136 — haptics adapter selection (no-op fallback + reduce-motion gate)", () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_HAPTICS_DISABLED;
    (globalThis as { __DEV_HAPTICS_UNAVAILABLE__?: boolean }).__DEV_HAPTICS_UNAVAILABLE__ = false;
  });
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_HAPTICS_DISABLED;
    (globalThis as { __DEV_HAPTICS_UNAVAILABLE__?: boolean }).__DEV_HAPTICS_UNAVAILABLE__ = false;
  });

  it("selects the real haptics adapter by default", async () => {
    const { selectHapticsAdapter } = await import("../mobile/lib/haptics");
    const adapter = selectHapticsAdapter();
    expect(adapter.kind).toBe("real");
  });

  it("selects the noop adapter when EXPO_PUBLIC_HAPTICS_DISABLED=true", async () => {
    process.env.EXPO_PUBLIC_HAPTICS_DISABLED = "true";
    const { selectHapticsAdapter } = await import("../mobile/lib/haptics");
    expect(selectHapticsAdapter().kind).toBe("noop");
  });

  it("selects the noop adapter when the SDK is unreachable at runtime", async () => {
    (globalThis as { __DEV_HAPTICS_UNAVAILABLE__?: boolean }).__DEV_HAPTICS_UNAVAILABLE__ = true;
    const { selectHapticsAdapter } = await import("../mobile/lib/haptics");
    expect(selectHapticsAdapter().kind).toBe("noop");
  });

  it("the noop adapter never throws and resolves void", async () => {
    process.env.EXPO_PUBLIC_HAPTICS_DISABLED = "true";
    const { selectHapticsAdapter } = await import("../mobile/lib/haptics");
    const adapter = selectHapticsAdapter();
    await expect(adapter.impact("Light")).resolves.toBeUndefined();
    await expect(adapter.notify("Success")).resolves.toBeUndefined();
    await expect(adapter.selection()).resolves.toBeUndefined();
  });

  it("the real adapter is fire-and-forget (never rejects even when the native call rejects)", async () => {
    // Inject a stub whose impactAsync rejects + throws synchronously, to prove
    // the RealHapticsAdapter's try/catch swallows both and resolves void
    // (fail-open invariant — a haptics outage must not break a press).
    vi.doMock("expo-haptics", () => ({
      ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" },
      NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
      impactAsync: async () => { throw new Error("haptics native failure"); },
      notificationAsync: () => { throw new Error("sync throw"); },
      selectionAsync: async () => { throw new Error("selection failed"); },
    }));
    vi.resetModules();
    const { selectHapticsAdapter, RealHapticsAdapter } = await import("../mobile/lib/haptics");
    const adapter: Awaited<ReturnType<typeof selectHapticsAdapter>> = new RealHapticsAdapter();
    expect(adapter.kind).toBe("real");
    // All three must resolve void despite the underlying native failures.
    await expect(adapter.impact("Light")).resolves.toBeUndefined();
    await expect(adapter.notify("Success")).resolves.toBeUndefined();
    await expect(adapter.selection()).resolves.toBeUndefined();
    vi.doUnmock("expo-haptics");
    vi.resetModules();
    expect(typeof RealHapticsAdapter).toBe("function");
  });
});

describe("136 — reduce-motion gate (spring disabled when on)", () => {
  it("disableSpringForReducedMotion returns the instant transition when reduce-motion is on", async () => {
    const { disableSpringForReducedMotion } = await import("../mobile/lib/haptics");
    const withMotion = { type: "spring" as const, damping: 18, stiffness: 320 };
    const reduced = disableSpringForReducedMotion(true, withMotion);
    expect(reduced).toEqual({ type: "timing", duration: 0 });
  });

  it("disableSpringForReducedMotion returns the spring untouched when reduce-motion is off", async () => {
    const { disableSpringForReducedMotion } = await import("../mobile/lib/haptics");
    const withMotion = { type: "spring" as const, damping: 18, stiffness: 320 };
    const reduced = disableSpringForReducedMotion(false, withMotion);
    expect(reduced).toBe(withMotion);
  });
});
