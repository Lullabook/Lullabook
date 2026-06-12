/**
 * Lazy environment lookup for real adapters.
 *
 * Adapters read env at call time (never at module load) so `next build` and
 * tests succeed without secrets present; a missing secret only fails the
 * request that actually needed it, with a descriptive error.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name} — see .env.example`
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
