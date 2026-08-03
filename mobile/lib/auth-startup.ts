import { resolveFirstOpenRoute, type FirstOpenRoute } from "./first-open";

export const AUTH_STARTUP_TIMEOUT_MS = 3_000;

type StartupDeps = {
  getSession: () => Promise<boolean>;
  hasSeenDemo: () => Promise<boolean>;
  demoRenderable: boolean;
};

/**
 * Resolve the first route without allowing keychain/network auth to hold the
 * native splash forever. A timeout is intentionally fail-closed to sign-in.
 */
export async function resolveFirstOpenStartup(
  deps: StartupDeps,
  timeoutMs = AUTH_STARTUP_TIMEOUT_MS
): Promise<FirstOpenRoute> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FirstOpenRoute>((resolve) => {
    timer = setTimeout(() => resolve("/sign-in"), timeoutMs);
  });
  const resolution = (async () => {
    const hasSession = await deps.getSession().catch(() => false);
    const seen = await deps.hasSeenDemo().catch(() => true);
    return resolveFirstOpenRoute({
      hasSession,
      hasSeenDemo: seen,
      demoRenderable: deps.demoRenderable,
    });
  })();

  try {
    return await Promise.race([resolution, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
