#!/usr/bin/env node
/**
 * Super.Engineering "Run" launcher — Lullabook iOS (issue 204 / local 196).
 *
 * One documented command sequence for the Super.Engineering Run button on a
 * current workspace:
 *
 *     npm run super:run        # == node scripts/super-engineering-launcher.mjs
 *
 * The launcher never hardcodes this checkout. It resolves the current workspace
 * from $SUPERCONDUCTOR_WORKSPACE_PATH and refuses a missing or non-Lullabook
 * workspace, then:
 *   1. starts the local paid-dev backend (root `dev:paid`, Next on :3001) —
 *      the port the mobile dev profile (mobile `ios:paid`) consumes;
 *   2. waits for an HTTP readiness response from that backend;
 *   3. starts the IPv4 Metro proxy (mobile/scripts/ipv4-metro-proxy.mjs) so
 *      Expo Go can reach Metro on 127.0.0.1:8081;
 *   4. invokes mobile `ios:paid` (expo start --ios) so the Simulator opens the
 *      latest workspace code.
 *
 * SIGINT/SIGTERM stop the backend, proxy, and Metro children. The launcher
 * adds, echoes, and stores no credentials: the backend inherits the shell env
 * for server config, while the proxy and Expo children receive only a safe
 * baseline env. The only mobile credentials in play are the dev-profile ones
 * already defined in mobile/package.json (dev-only simulator credentials — never
 * provider keys).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const BACKEND_PORT = 3001; // port consumed by the mobile dev profile (mobile `ios:paid`)
export const READINESS_URL = `http://127.0.0.1:${BACKEND_PORT}/`;
const READINESS_TIMEOUT_MS = 120_000;
const READINESS_POLL_MS = 1_000;
// Bounds a single readiness attempt so one hung connection cannot defeat the
// overall readiness timeout above.
const READINESS_ATTEMPT_TIMEOUT_MS = 5_000;
const MOBILE_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PWD",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "TERM",
  "CI",
  "FORCE_COLOR",
  "SUPERCONDUCTOR_WORKSPACE_PATH",
]);

export class LauncherError extends Error {
  constructor(message) {
    super(message);
    this.name = "LauncherError";
  }
}

function mobileChildEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => MOBILE_ENV_KEYS.has(key))
  );
}

/** Resolve the current workspace; throw LauncherError unless it is a Lullabook checkout. */
export function resolveWorkspace(env) {
  const raw = env.SUPERCONDUCTOR_WORKSPACE_PATH;
  if (!raw || !raw.trim()) {
    throw new LauncherError(
      "SUPERCONDUCTOR_WORKSPACE_PATH is not set — cannot resolve the current workspace"
    );
  }
  const workspace = path.resolve(raw);
  const pkgPath = path.join(workspace, "package.json");
  if (!existsSync(pkgPath)) {
    throw new LauncherError(`not a workspace: ${workspace} (no package.json)`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const isLullabook =
    pkg.name === "lullabook" &&
    existsSync(path.join(workspace, "mobile", "package.json")) &&
    existsSync(path.join(workspace, "src"));
  if (!isLullabook) {
    throw new LauncherError(`not a Lullabook workspace: ${workspace}`);
  }
  return workspace;
}

/** Poll url until an HTTP response arrives (status < 500) or timeoutMs elapses. */
export async function waitForReadiness({
  fetchFn = fetch,
  url,
  timeoutMs = READINESS_TIMEOUT_MS,
  pollMs = READINESS_POLL_MS,
  log = () => {},
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const attemptTimeoutMs = Math.max(1, Math.min(remainingMs, READINESS_ATTEMPT_TIMEOUT_MS));
    try {
      // Race each attempt against its own bound: a single hung connection
      // (TCP connects but never responds) must not stall the whole wait past
      // the overall timeoutMs above.
      const controller = new AbortController();
      let attemptTimer;
      try {
        const res = await Promise.race([
          fetchFn(url, { method: "GET", signal: controller.signal }),
          new Promise((_, reject) => {
            attemptTimer = setTimeout(() => {
              controller.abort();
              reject(new Error("readiness attempt timed out"));
            }, attemptTimeoutMs);
          }),
        ]);
        if (res.status < 500) {
          log(`backend ready (HTTP ${res.status})`);
          return true;
        }
        log(`backend responded HTTP ${res.status} — waiting`);
      } finally {
        clearTimeout(attemptTimer);
        controller.abort();
      }
    } catch {
      log("backend not reachable yet — waiting");
    }
    await sleep(pollMs);
  }
  return false;
}

/**
 * Run the launcher with injectable side-effects (spawn/fetch/signal
 * registration) so the contract test can fake every external process.
 *
 * Returns { ok, exitCode, cleanup } — cleanup(signal) kills every tracked child
 * and returns the shell exit code for that signal (130 SIGINT / 143 SIGTERM).
 */
export async function run({
  env = process.env,
  spawnFn = spawn,
  fetchFn = fetch,
  registerSignal = (signal, handler) => process.on(signal, handler),
  log = () => {},
  readiness = {},
} = {}) {
  const workspace = resolveWorkspace(env);
  const mobileDir = path.join(workspace, "mobile");
  const childEnv = mobileChildEnv({ ...process.env, ...env });
  const children = new Set();

  const killAll = (signal = "SIGTERM") => {
    for (const child of [...children]) {
      try {
        child.kill(signal);
      } catch {
        // child already exited — nothing to kill
      }
    }
  };

  const track = (child, label) => {
    children.add(child);
    child.once?.("exit", () => children.delete(child));
    // Without an 'error' listener, a spawn failure (e.g. ENOENT) is an
    // unhandled EventEmitter 'error' and crashes the whole launcher instead
    // of failing gracefully and cleaning up the siblings it already started.
    child.on?.("error", (err) => {
      log(`${label} failed to start: ${err.message ?? err} — stopping the others`);
      children.delete(child);
      killAll("SIGTERM");
    });
    log(`  started ${label} (pid ${child.pid ?? "n/a"})`);
    return child;
  };

  // Pure cleanup handler: kill children, return the signal's shell exit code.
  const cleanup = (signal) => {
    log(`received ${signal} — stopping backend, proxy, and Metro`);
    killAll(signal);
    return signal === "SIGINT" ? 130 : 143;
  };

  // Wire real signals in production; tests inject a fake registrar.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    registerSignal(signal, () => process.exit(cleanup(signal)));
  }

  log(`Lullabook launcher — workspace: ${workspace}`);

  log(`starting backend (npm run dev:paid, Next on :${BACKEND_PORT})`);
  track(
    spawnFn("npm", ["run", "dev:paid"], { cwd: workspace, stdio: "inherit" }),
    "backend (dev:paid)"
  );

  const ready = await waitForReadiness({
    fetchFn,
    url: readiness.url ?? READINESS_URL,
    timeoutMs: readiness.timeoutMs ?? READINESS_TIMEOUT_MS,
    pollMs: readiness.pollMs ?? READINESS_POLL_MS,
    log,
  });
  if (!ready) {
    log(`backend not ready at ${readiness.url ?? READINESS_URL} — exiting non-zero`);
    killAll("SIGTERM");
    return { ok: false, exitCode: 1, cleanup };
  }

  log("starting IPv4 Metro proxy (mobile/scripts/ipv4-metro-proxy.mjs)");
  track(
    spawnFn("node", [path.join(mobileDir, "scripts", "ipv4-metro-proxy.mjs")], {
      cwd: mobileDir,
      stdio: "inherit",
      env: childEnv,
    }),
    "IPv4 Metro proxy"
  );

  log("invoking mobile iOS launch command (npm run ios:paid → expo start --ios)");
  track(
    spawnFn("npm", ["run", "ios:paid"], {
      cwd: mobileDir,
      stdio: "inherit",
      env: childEnv,
    }),
    "mobile ios:paid"
  );

  return { ok: true, exitCode: 0, cleanup };
}

// CLI entry: only runs when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await run({ log: console.log });
    if (!result.ok) process.exit(result.exitCode);
    // ok: the children keep the event loop alive; signal handlers clean up on exit.
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}
