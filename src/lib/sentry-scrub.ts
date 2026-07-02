/**
 * Issue 150 — Sentry scrubbing for the Next.js API/server.
 *
 * The COPPA/GDPR line is the load-bearing one: the logger MUST NEVER capture
 * child photos, biometric/LoRA data, PII, consent tokens, auth tokens, or any
 * secret. This module is the pure, tested scrubber that `beforeSend` calls.
 *
 * `sendDefaultPii: false` is set in the config; this scrubber is the defense-
 * in-depth that strips anything that slipped through. It is:
 *  - **Pure** — takes an event, returns a scrubbed event (testable in node env).
 *  - **Fail-open** — the scrubber itself never throws; if it can't scrub, it
 *    drops the whole event rather than risking a PII leak.
 */

/** Patterns that identify PII / child data / secrets to strip. */
const SCRUB_KEYS = [
  /photo/i,
  /avatar/i,
  /selfie/i,
  /likeness/i,
  /lora/i,
  /voice/i,
  /clip/i,
  /audio/i,
  /consent/i,
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /jwt/i,
  /bearer/i,
  /authorization/i,
  /email/i,
  /birthdate/i,
  /child/i,
  /baby/i,
  /minor/i,
  /family/i,
  /member/i,
  /persona/i,
  /blob/i,
  /url/i,
  /key/i,
];

/** URL/path substrings that indicate child/biometric data (strip the value). */
const SCRUB_URL_PATTERNS = [
  /\/voice\//i,
  /\/avatars\//i,
  /\/photos\//i,
  /\/selfie/i,
  /\/personas\//i,
  /\/babies\//i,
  /\/family\//i,
  /\/consent\//i,
  /\.webm/i,
  /\.png|\.jpg|\.jpeg/i,
  /storage\.supabase/i,
  /signed/i,
];

/**
 * Scrub a single string value: if the key name or value matches a PII pattern,
 * replace the value with `[redacted]`. Returns the scrubbed value.
 */
export function scrubValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // If the key name matches a PII pattern, redact the value entirely (most
  // aggressive — safer to over-redact than to leak).
  if (SCRUB_KEYS.some((re) => re.test(key))) {
    return "[redacted]";
  }

  // If the value looks like a URL/path to child/biometric data, redact it.
  if (typeof value === "string" && SCRUB_URL_PATTERNS.some((re) => re.test(value))) {
    return "[redacted-url]";
  }

  // If the value looks like a base64 blob or a long opaque token, redact it.
  if (typeof value === "string" && value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    return "[redacted-blob]";
  }

  return value;
}

/**
 * Recursively scrub an object: walk every key/value pair and redact anything
 * matching a PII pattern. Never throws — on any error, returns `[scrub-error]`.
 */
export function scrubObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  try {
    if (Array.isArray(obj)) {
      return obj.map(scrubObject);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = typeof v === "object" ? scrubObject(v) : scrubValue(k, v);
    }
    return out;
  } catch {
    return "[scrub-error]";
  }
}

/**
 * The `beforeSend` hook: scrub the Sentry event's request body, extra, breadcrumbs,
 * and any field that might carry PII. Drops the event entirely if scrubbing fails
 * catastrophically (fail-safe — never leak).
 */
export function beforeSendScrub(event: Record<string, unknown>): Record<string, unknown> | null {
  try {
    if (event.request) {
      (event as { request: Record<string, unknown> }).request = scrubObject(event.request) as Record<string, unknown>;
    }
    if (event.extra) {
      (event as { extra: Record<string, unknown> }).extra = scrubObject(event.extra) as Record<string, unknown>;
    }
    if (event.breadcrumbs) {
      (event as { breadcrumbs: unknown[] }).breadcrumbs = scrubObject(event.breadcrumbs) as unknown[];
    }
    if (event.contexts) {
      (event as { contexts: Record<string, unknown> }).contexts = scrubObject(event.contexts) as Record<string, unknown>;
    }
    // Never set user with email/name — opaque ID only.
    if (event.user) {
      const u = event.user as Record<string, unknown>;
      delete u.email;
      delete u.username;
      delete u.ip_address;
      (event as { user: Record<string, unknown> }).user = { id: (u.id as string) ?? "opaque" };
    }
    return event;
  } catch {
    return null; // drop the event rather than risk a PII leak
  }
}

/**
 * Whether Sentry should be active. Disabled in test (Vitest/Playwright) and
 * when no DSN is configured. Fail-open: no DSN → no capture → app still works.
 */
export function shouldSentryBeActive(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (!process.env.SENTRY_DSN) return false;
  return true;
}
