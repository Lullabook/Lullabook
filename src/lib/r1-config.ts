import { NextResponse } from "next/server";

/**
 * PRD v16 — R1 Ruthless Cut config (issues 145–148).
 *
 * Centralizes the feature flags that gate deferred/cut features server-side.
 * Each cut is **inert by default in R1**: the flag opts a feature *in* (R2),
 * mirroring the `R1_ONE_PLAN` convention in `paywall-config.ts`. A route
 * handler consults these helpers to return a clean `404` (never a 500) when a
 * feature is cut — the server gate *is* the cut, not a hidden button. Cut code
 * stays behind these flags so R2 re-enables by data change, not a rebuild.
 *
 * All reads are `process.env === "true"` so an unset var means "cut". Tests opt
 * a feature back in by setting the env var to `"true"` (the R2 / pre-cut path).
 */

/** Issue 145 — Audio (voice clips, voice messages, lullaby weave, narration). */
export function isR1AudioEnabled(): boolean {
  return process.env.R1_AUDIO_ENABLED === "true";
}

/**
 * Issue 146 — Multi-family (invited members, family logins, collaborative plan,
 * multi-baby). When false, invite/accept/voice-message endpoints are disabled
 * and create-rights resolve to solo-Guardian-only.
 */
export function isR1MultiFamilyEnabled(): boolean {
  return process.env.R1_MULTI_FAMILY_ENABLED === "true";
}

/**
 * Issue 147 — US-only jurisdiction for R1.0. When true, only the US markets
 * (US / US_IOS) are enabled; Asia slots stay in the config (flag-disabled) so
 * R1.1 enables them by data change. When false (R2 / pre-cut), the per-market
 * `enabled` flags in `ConsentEngine` govern as before.
 */
export function isR1UsOnly(): boolean {
  return process.env.R1_US_ONLY === "true";
}

/** The US market codes that remain enabled under the R1 US-only cut. */
export const R1_US_MARKETS = new Set(["US", "US_IOS"]);

/**
 * Issue 148 — Heavy Journal machinery (Story Context Engine / auto-context
 * injection, Firsts, Birthday Story, weekly suggestion, photo-to-story). Daily
 * Notes capture stays enabled regardless of this flag.
 */
export function isR1JournalMachineryEnabled(): boolean {
  return process.env.R1_JOURNAL_MACHINERY_ENABLED === "true";
}

/** The canonical message returned by a cut/disabled endpoint. */
export function r1CutMessage(feature: string): string {
  return `${feature} is not available in this release`;
}

/**
 * A clean "feature not available" response for cut endpoints. Cut features fail
 * as **absent**, never as an error — `404` ("does not exist in this release") is
 * the inert semantic. Returned before auth so a cut endpoint never runs.
 */
export function r1CutResponse(feature: string): NextResponse {
  return NextResponse.json({ error: r1CutMessage(feature) }, { status: 404 });
}
