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

export type StartupMilestoneName = "process-start" | "interactive" | "first-read";
const STARTUP_MILESTONES: readonly StartupMilestoneName[] = [
  "process-start",
  "interactive",
  "first-read",
];

/**
 * Whether startup timing is active. Dev-only by design: `__DEV__` on native,
 * or an explicit development/test environment on web/test.
 */
export function startupTimingEnabled(
  dev: boolean | undefined = typeof __DEV__ === "boolean" ? __DEV__ : undefined,
  env: string | undefined = process.env.NODE_ENV
): boolean {
  return typeof dev === "boolean" ? dev : env === "development" || env === "test";
}

export interface StartupMilestone {
  name: StartupMilestoneName;
  ms: number;
}

const ENABLED = startupTimingEnabled();
const START = typeof performance !== "undefined" ? performance.now() : Date.now();
const milestones: StartupMilestone[] = [];
const recorded = new Set<StartupMilestoneName>();

function elapsedSinceStart(): number {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = now - START;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
}

/** Record a startup milestone (dev only — no-op in production bundles). */
export function recordStartup(name: string): void {
  if (!ENABLED) return;
  if (!STARTUP_MILESTONES.includes(name as StartupMilestoneName)) return;
  const milestone = name as StartupMilestoneName;
  if (recorded.has(milestone)) return;
  recorded.add(milestone);
  milestones.push({ name: milestone, ms: elapsedSinceStart() });
}

/** Milestones recorded so far, for the dev overlay / breadcrumb. */
export function getStartupMilestones(): readonly StartupMilestone[] {
  return milestones.map((milestone) => Object.freeze({ ...milestone }));
}
