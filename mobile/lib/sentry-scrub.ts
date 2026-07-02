/**
 * Issue 151 — Mobile Sentry scrubber (pure, testable in node env).
 *
 * Same COPPA/GDPR scrubbing as the server (src/lib/sentry-scrub.ts). Separated
 * from sentry-init.ts so it can be exercised in Vitest without RN globals.
 */

const SCRUB_KEYS = [
  /photo/i, /avatar/i, /selfie/i, /likeness/i, /lora/i, /voice/i, /clip/i,
  /audio/i, /consent/i, /token/i, /secret/i, /password/i, /api[_-]?key/i,
  /service[_-]?role/i, /jwt/i, /bearer/i, /authorization/i, /email/i,
  /birthdate/i, /child/i, /baby/i, /minor/i, /family/i, /member/i,
  /persona/i, /blob/i, /url/i, /key/i,
];

const SCRUB_URL_PATTERNS = [
  /\/voice\//i, /\/avatars\//i, /\/photos\//i, /\/selfie/i, /\/personas\//i,
  /\/babies\//i, /\/family\//i, /\/consent\//i, /\.webm/i, /\.png|\.jpg|\.jpeg/i,
  /storage\.supabase/i, /signed/i,
];

function scrubValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SCRUB_KEYS.some((re) => re.test(key))) return "[redacted]";
  if (typeof value === "string" && SCRUB_URL_PATTERNS.some((re) => re.test(value))) return "[redacted-url]";
  if (typeof value === "string" && value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value)) return "[redacted-blob]";
  return value;
}

function scrubObject(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  try {
    if (Array.isArray(obj)) return obj.map(scrubObject);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = typeof v === "object" ? scrubObject(v) : scrubValue(k, v);
    }
    return out;
  } catch {
    return "[scrub-error]";
  }
}

export function beforeEachScrubMobile(event: Record<string, unknown>): Record<string, unknown> | null {
  try {
    if (event.request) (event as { request: Record<string, unknown> }).request = scrubObject(event.request) as Record<string, unknown>;
    if (event.extra) (event as { extra: Record<string, unknown> }).extra = scrubObject(event.extra) as Record<string, unknown>;
    if (event.breadcrumbs) (event as { breadcrumbs: unknown[] }).breadcrumbs = scrubObject(event.breadcrumbs) as unknown[];
    if (event.contexts) (event as { contexts: Record<string, unknown> }).contexts = scrubObject(event.contexts) as Record<string, unknown>;
    if (event.user) {
      const u = event.user as Record<string, unknown>;
      delete u.email; delete u.username; delete u.ip_address;
      (event as { user: Record<string, unknown> }).user = { id: (u.id as string) ?? "opaque" };
    }
    return event;
  } catch {
    return null;
  }
}

/** Whether Sentry should be active on mobile. Pure (no RN globals). */
export function shouldMobileSentryBeActive(hasDsn: boolean, isDev: boolean): boolean {
  if (!hasDsn) return false;
  if (isDev && !hasDsn) return false;
  return true;
}
