/**
 * Issue 151 — Sentry on the Expo app: crash capture, source maps, no photo
 * replay.
 *
 * Same COPPA/GDPR scrubbing as the server (mirrors src/lib/sentry-scrub.ts).
 * The pure scrubber lives in mobile/lib/sentry-scrub.ts so it can be exercised
 * in Vitest without RN globals.
 *
 * Fails open: if the SDK is unreachable/misconfigured, the app still renders.
 * `SENTRY_AUTH_TOKEN` (for source map upload) is an EAS secret / build-time
 * only — never in the bundle or an `EXPO_PUBLIC_*` var.
 */
import { beforeEachScrubMobile } from "@/lib/sentry-scrub";

declare const __DEV__: boolean;

/**
 * Initialize Sentry in the Expo root layout. Fire-and-forget — never blocks
 * the app from rendering. If the SDK can't be imported or init fails, the app
 * continues normally (fail-open).
 */
export async function initMobileSentry(): Promise<void> {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react-native");
    Sentry.init({
      dsn,
      environment: __DEV__ ? "development" : "production",
      release: process.env.EXPO_PUBLIC_SENTRY_RELEASE ?? "dev",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
      beforeSend(event) {
        return beforeEachScrubMobile(event as unknown as Record<string, unknown>) as unknown as typeof event;
      },
    });
  } catch {
    // Fail-open: a Sentry outage never breaks the app.
  }
}
