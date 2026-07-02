/**
 * Issue 150 — Sentry config for the server runtime.
 *
 * EU (Frankfurt) region; `sendDefaultPii: false`; scrubbing via beforeSend.
 * Fail-open: disabled when DSN is absent or under test.
 */
import * as Sentry from "@sentry/nextjs";
import { shouldSentryBeActive, beforeSendScrub } from "@/lib/sentry-scrub";

if (shouldSentryBeActive()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN!,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE ?? "dev",
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      return beforeSendScrub(event as unknown as Record<string, unknown>) as unknown as typeof event;
    },
  });
}

/** Fire-and-forget capture for Inngest job catch-blocks + manual capture sites. */
export function captureException(err: unknown): void {
  if (!shouldSentryBeActive()) return;
  try {
    Sentry.captureException(err);
  } catch {
    // Fail-open: capture never blocks.
  }
}
