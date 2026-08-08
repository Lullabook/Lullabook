/**
 * Issue 203 — the fal.ai training callback origin, read from configuration and
 * never hardcoded.
 *
 * fal.ai must be able to reach a stable PUBLIC callback URL to deliver a
 * training result (PRD v23, LAT-5/FAIL-6). That origin is configuration, not a
 * defaulted constant: `NEXT_PUBLIC_APP_URL` names the deployed origin and, from
 * it, the callback endpoint is derived. A missing value fails closed at startup
 * (config validation throws) — there is deliberately no `localhost` fallback
 * here, because a tunnel/local origin silently strands overnight callbacks.
 */

/** The environment variable that names the deployed public origin. */
export const CALLBACK_ORIGIN_ENV = "NEXT_PUBLIC_APP_URL";

export class CallbackOriginConfigError extends Error {
  constructor(envName: string = CALLBACK_ORIGIN_ENV) {
    super(
      `Missing required environment variable ${envName} — the fal.ai training ` +
        `callback origin is not configured. Set it to the deployed Vercel origin; ` +
        `there is no hardcoded fallback.`,
    );
    this.name = "CallbackOriginConfigError";
  }
}

/**
 * Strict resolver: throws {@link CallbackOriginConfigError} when the callback
 * origin is missing. Fails closed — an unconfigured origin is a misconfiguration,
 * never silently treated as reachable.
 */
export function resolveCallbackOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const value = env[CALLBACK_ORIGIN_ENV];
  if (!value) throw new CallbackOriginConfigError();
  return value;
}

/** Startup/deploy guard — throws when the origin is unset (fail closed). */
export function assertCallbackOriginConfigured(env: NodeJS.ProcessEnv = process.env): string {
  return resolveCallbackOrigin(env);
}

/** Normalise a configured origin to a bare protocol://host[:port] origin. */
export function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new CallbackOriginConfigError(
      `${CALLBACK_ORIGIN_ENV} does not name a valid URL: ${origin}`,
    );
  }
}

/**
 * The exact fal.ai webhook endpoint that the callback origin must serve.
 * Derived from configuration, never hardcoded.
 */
export function callbackEndpointUrl(origin: string): string {
  return `${normalizeOrigin(origin)}/api/webhooks/fal`;
}
