/**
 * Issue 171 (SEC-1) — typed client surface for the server's 403 entitlement
 * boundary. The server is the ONLY place entitlement is decided; the client
 * merely recognizes the machine code on a 403 and routes to the paywall.
 *
 * Dependency-free on purpose (like purchase-controller.ts) so the root
 * vitest suite can drive it directly.
 */

export const ENTITLEMENT_CODES = [
  "not_entitled",
  "create_not_allowed",
  "story_cap_reached",
] as const;

export type EntitlementCode = (typeof ENTITLEMENT_CODES)[number];

export class ApiEntitlementError extends Error {
  readonly code: EntitlementCode;

  constructor(message: string, code: EntitlementCode) {
    super(message);
    this.name = "ApiEntitlementError";
    this.code = code;
  }
}

/**
 * Returns a typed error ONLY for a 403 carrying a known entitlement code.
 * Non-403 statuses and non-entitlement 403s (e.g. auth/ownership refusals)
 * are never hijacked into the paywall.
 */
export function classifyEntitlementError(
  status: number,
  body: unknown
): ApiEntitlementError | null {
  if (status !== 403) return null;
  if (!body || typeof body !== "object") return null;
  const { code, error } = body as { code?: unknown; error?: unknown };
  if (typeof code !== "string") return null;
  if (!(ENTITLEMENT_CODES as readonly string[]).includes(code)) return null;
  const message = typeof error === "string" ? error : "This needs an active plan";
  return new ApiEntitlementError(message, code as EntitlementCode);
}

export function isEntitlementError(err: unknown): err is ApiEntitlementError {
  return (
    err instanceof ApiEntitlementError ||
    (err instanceof Error && err.name === "ApiEntitlementError")
  );
}
