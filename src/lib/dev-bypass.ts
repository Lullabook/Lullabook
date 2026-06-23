/**
 * Issue 108 — Dev-only bypass gates for the Simulator. All paths are
 * double-gated (server-authoritative): `NODE_ENV !== "production"` AND an
 * explicit env flag, exactly like `DEV_FORCE_SUBSCRIPTION`. Inert in
 * production — the functions return `false` before any bypass runs.
 */

import { DevFalFallbackAdapter } from "@/adapters/dev-fal-fallback";
import { RealFalAdapter } from "@/adapters/fal";
import type { FalAdapter } from "@/adapters/types";

/** Whether the Rekognition liveness check should be bypassed with FakeLiveness. */
export function shouldDevBypassLiveness(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_LIVENESS_BYPASS === "true"
  );
}

/** Whether fal training should fall back to a placeholder (no live fal keys). */
export function shouldDevFalFallback(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_FAL_FALLBACK === "true"
  );
}

/**
 * Issue 123 — Select the fal adapter by the **flag alone**. A present
 * `FAL_API_KEY` does NOT defeat an explicit `DEV_FAL_FALLBACK=true`: the dev
 * `.env.local` sets a key, so the previous `&& !optionalEnv("FAL_API_KEY")`
 * clause always picked the real adapter in dev → 100% illustration failure
 * (the LoRA keys synthesized by the dev workflow are not real fal paths). Flag
 * precedence matches `DEV_FORCE_SUBSCRIPTION`. Inert in production.
 */
export function selectFalAdapter(): FalAdapter {
  return shouldDevFalFallback() ? new DevFalFallbackAdapter() : new RealFalAdapter();
}
