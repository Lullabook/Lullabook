/**
 * PRD v16 (issues 145–148) — R1 cut flags for the mobile app.
 *
 * Mobile mirror of the server-side `src/lib/r1-config.ts`. Each cut feature is
 * **inert by default** (flag unset = cut); the reachable UI is removed and the
 * code stays behind the flag so R2 re-enables by env change, not a rebuild.
 * A cut feature renders an inert "not available in this release" state — never
 * a dead button.
 */
export function isR1AudioEnabled(): boolean {
  return process.env.EXPO_PUBLIC_R1_AUDIO_ENABLED === "true";
}

export function isR1MultiFamilyEnabled(): boolean {
  return process.env.EXPO_PUBLIC_R1_MULTI_FAMILY_ENABLED === "true";
}

export function isR1JournalMachineryEnabled(): boolean {
  return process.env.EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED === "true";
}

export const R1_CUT_MESSAGE = "is not available in this release";
