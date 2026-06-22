/**
 * Issue 108 — Dev-only bypass gates for the Simulator. All paths are
 * double-gated (server-authoritative): `NODE_ENV !== "production"` AND an
 * explicit env flag, exactly like `DEV_FORCE_SUBSCRIPTION`. Inert in
 * production — the functions return `false` before any bypass runs.
 */

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
