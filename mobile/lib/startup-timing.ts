/**
 * Issue 191 — dev-only native startup timing (process-start → interactive →
 * first-read milestones) plus the breadcrumb the overlay renders.
 *
 * Pure TS (no RN imports) so Vitest can exercise it in the node env. Numbers
 * only: milestone names are fixed literals, values are ms since module eval
 * (the earliest JS execution point the app entry controls). Never records
 * user data — a milestone is a name + a number.
 */

declare const __DEV__: boolean | undefined;

/**
 * Whether startup timing is active. Dev-only by design: `__DEV__` on native,
 * anything-but-production on web/test.
 */
export function startupTimingEnabled(
  dev: boolean | undefined = typeof __DEV__ === "boolean" ? __DEV__ : undefined,
  env: string | undefined = process.env.NODE_ENV
): boolean {
  return typeof dev === "boolean" ? dev : env !== "production";
}

export interface StartupMilestone {
  name: string;
  ms: number;
}

const ENABLED = startupTimingEnabled();
const START = Date.now();
const milestones: StartupMilestone[] = [];

/** Record a startup milestone (dev only — no-op in production bundles). */
export function recordStartup(name: string): void {
  if (!ENABLED) return;
  milestones.push({ name, ms: Date.now() - START });
}

/** Milestones recorded so far, for the dev overlay / breadcrumb. */
export function getStartupMilestones(): readonly StartupMilestone[] {
  return milestones;
}
