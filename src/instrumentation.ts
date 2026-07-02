/**
 * Issue 150 — Sentry instrumentation hook for Next.js.
 *
 * Captures unhandled API-route errors and unhandled rejections automatically.
 * Fail-open: if Sentry is unavailable/misconfigured, the app still works —
 * capture is fire-and-forget and never blocks a response.
 */
export async function register(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  if (!process.env.SENTRY_DSN) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    const { shouldSentryBeActive } = await import("@/lib/sentry-scrub");
    if (!shouldSentryBeActive()) return;

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      release: process.env.SENTRY_RELEASE ?? "dev",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        return require("@/lib/sentry-scrub").beforeSendScrub(event as unknown as Record<string, unknown>) as unknown as typeof event;
      },
    });
  } catch {
    // Fail-open: a Sentry outage never breaks the app.
  }
}
