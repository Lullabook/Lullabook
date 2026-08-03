/**
 * Issue 187 — pure client logic for generation progress + failure UX.
 *
 * Dependency-free on purpose (like entitlement-error.ts / purchase-controller.ts)
 * so the root vitest suite can drive it directly. Live wiring lives in
 * mobile/lib/api.ts and the screens.
 *
 * Guarantees:
 *   - Raw provider/domain error text is NEVER rendered: classifyGenerationError
 *     maps every failure to typed parent-facing copy plus an action kind
 *     (sign-in / paywall / consent / retry / support).
 *   - A create request stalled beyond 20s throws CreateRequestTimeoutError
 *     (detected by typed name, never by message text) → retry card.
 *   - Polling stops on terminal statuses; the five-minute watchdog is a
 *     single constant both the reader and tests derive from.
 */
import type { StorybookStatus } from "../../src/domain/types";
import { isConsentRequiredError, isEntitlementError } from "./entitlement-error";

export const CREATE_REQUEST_TIMEOUT_MS = 20_000;
export const READER_POLL_INTERVAL_MS = 2_500;
export const READER_POLL_BUDGET_MS = 5 * 60 * 1000;
export const READER_POLL_MAX_DELAY_MS = 30_000;

/** Bounded exponential backoff: a five-minute run stays under 40 reads. */
export function nextReaderPollDelayMs(attempt: number): number {
  return Math.min(READER_POLL_MAX_DELAY_MS, READER_POLL_INTERVAL_MS * 2 ** attempt);
}

export function countReaderStatusRequests(durationMs: number): number {
  if (durationMs <= 0) return 0;
  let elapsed = 0;
  let requests = 0;
  let attempt = 0;
  while (elapsed < durationMs) {
    elapsed += nextReaderPollDelayMs(attempt++);
    requests++;
  }
  return requests;
}

// React Native's AppStateStatus includes an "unknown" startup state. Treat it
// as non-active so polling remains fail-closed until the app is foregrounded.
export type ReaderAppState = "active" | "background" | "inactive" | "unknown";

export function shouldPollInAppState(state: string): boolean {
  return state === "active";
}

export function shouldFetchOnResume(previous: string, current: string): boolean {
  return previous !== "active" && current === "active";
}

const TERMINAL_STATUSES: readonly StorybookStatus[] = ["draft", "failed", "finalized"];

export function isTerminalStatus(status: StorybookStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Whether the reader should own an active polling timer for this snapshot. */
export function shouldPollStorybook(
  status: StorybookStatus,
  pollTimedOut: boolean
): boolean {
  return !pollTimedOut && !isTerminalStatus(status);
}

/** The 5-minute watchdog: once the budget is exceeded the reader renders a
 * terminal timeout state instead of spinning forever. */
export function isPollBudgetExhausted(
  startedAtMs: number | null,
  nowMs: number,
  budgetMs: number = READER_POLL_BUDGET_MS
): boolean {
  return startedAtMs !== null && nowMs - startedAtMs >= budgetMs;
}

/** Server-derived progress wire shape (matches src/lib/storybook-progress.ts). */
export interface GenerationProgress {
  phase: "writing" | "illustrating" | "complete" | "failed";
  pagesReady: number;
  pagesTotal: number;
}

/** Parent-facing phase copy — the raw phase enum never reaches the screen. */
export function generationProgressCopy(progress: GenerationProgress): string {
  if (progress.phase === "writing") return "Writing your story…";
  if (progress.phase === "illustrating") {
    return progress.pagesReady > 0
      ? `Illustrating page ${progress.pagesReady} of ${progress.pagesTotal}…`
      : "Illustrating your pages — this usually takes a minute.";
  }
  if (progress.phase === "failed") return "This Storybook couldn't be finished.";
  return "Your Storybook is ready to read.";
}

/** A create request that exceeded the 20s bound. Typed name, never message text. */
export class CreateRequestTimeoutError extends Error {
  constructor() {
    super("Generation is taking longer than expected.");
    this.name = "CreateRequestTimeoutError";
  }
}

export function isCreateRequestTimeout(err: unknown): err is CreateRequestTimeoutError {
  return err instanceof Error && err.name === "CreateRequestTimeoutError";
}

/** A 401 from the API — routes to sign-in, never an inline error card. */
export class ApiSignInRequiredError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "ApiSignInRequiredError";
  }
}

export function isApiSignInRequired(err: unknown): err is ApiSignInRequiredError {
  return err instanceof Error && err.name === "ApiSignInRequiredError";
}

/** Any non-OK, non-typed API response; keeps the HTTP status for classification. */
export class ApiStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiStatusError";
    this.status = status;
  }
}

export function isApiStatusError(err: unknown): err is ApiStatusError {
  return err instanceof Error && err.name === "ApiStatusError";
}

export type GenerationFailureKind = "sign-in" | "paywall" | "consent" | "retry" | "support";

export interface GenerationFailure {
  kind: GenerationFailureKind;
  /** Parent-facing copy; never raw provider/domain error text. */
  message: string;
  /** True → the UI offers a retry affordance; false → a support action. */
  retryable: boolean;
}

/**
 * Map any thrown value to a typed, parent-facing failure. Every displayed
 * failure gets a typed action (retry, or sign-in/paywall/consent/support
 * navigation). Raw provider/domain text is swallowed, never echoed.
 */
export function classifyGenerationError(err: unknown): GenerationFailure {
  if (isEntitlementError(err)) {
    return { kind: "paywall", message: "Illustrated Stories need an active plan.", retryable: false };
  }
  if (isConsentRequiredError(err)) {
    return { kind: "consent", message: "Parental consent is required before creating this.", retryable: false };
  }
  if (isCreateRequestTimeout(err)) {
    return { kind: "retry", message: "Generation is taking longer than expected — you can try again.", retryable: true };
  }
  if (isApiSignInRequired(err)) {
    return { kind: "sign-in", message: "Please sign in to continue.", retryable: false };
  }
  if (isApiStatusError(err) && err.status === 404) {
    return { kind: "support", message: "This Storybook is no longer available.", retryable: false };
  }
  // Catch-all: any other error (provider outage, network, 5xx, …) is a
  // retryable failure with safe copy — the raw message never renders.
  return { kind: "retry", message: "Something went wrong — please try again.", retryable: true };
}
