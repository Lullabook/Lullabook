#!/usr/bin/env node
/**
 * Issue 208 (local ticket 200) — one-command iPhone device build.
 *
 * Composes ticket 199's LAN address detection with the `LULLABOOK_FREE_TEAM`
 * entitlement flag (ticket 198) so a human cannot forget either. The planner
 * (`planIosDeviceRun`) is pure and testable: it returns the environment and the
 * steps to run; the thin CLI wrapper below resolves the address, checks for an
 * existing native project, prints the plan under `--dry-run`, and only then
 * executes it.
 *
 * Fail-closed (F1, F2, F5): no private LAN address → a named error and exit 1
 * before Metro starts, never a loopback/stale/public fallback; the run step
 * always targets `--device`, never the Simulator; the free-team flag is set by
 * the script itself.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { selectPrivateLanAddress, parseInterfaces } from "./lan-address.mjs";

/** Backend the device app talks to (dev:all). */
export const DEV_BACKEND_PORT = 3002;
/** @type {"1"} */
const FREE_TEAM_FLAG = "1";

/**
 * @typedef {{ ok: true, address: string, env: Record<string, string>, steps: { name: string, command: string }[] } | { ok: false, error: string, env: Record<string, string>, steps: never[] }} IosDevicePlan
 */

/**
 * Pure planner. `address` is the detected private LAN IPv4 address (or null
 * when none exists); `iosDirExists` is whether `mobile/ios` is already
 * generated. Returns the environment and ordered steps — or a fail-closed
 * failure with no command to execute when there is no usable address.
 *
 * @param {{ address: string | null, iosDirExists: boolean }} input
 * @returns {IosDevicePlan}
 */
export function planIosDeviceRun({ address, iosDirExists }) {
  const env = { LULLABOOK_FREE_TEAM: FREE_TEAM_FLAG };
  if (!address) {
    return {
      ok: false,
      error:
        "no private RFC1918 IPv4 address found (Wi-Fi off? Ethernet only? loopback only?). " +
        "Refusing to fall back.",
      env,
      steps: [],
    };
  }
  env.EXPO_PUBLIC_API_URL = `http://${address}:${DEV_BACKEND_PORT}`;
  env.REACT_NATIVE_PACKAGER_HOSTNAME = address;
  const steps = [];
  if (!iosDirExists) {
    // Prebuild only when the native project is absent; never `--clean`.
    steps.push({ name: "prebuild", command: "npx expo prebuild --platform ios" });
  }
  steps.push({ name: "run", command: "npx expo run:ios --device" });
  return { ok: true, address, env, steps };
}

function isMain() {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
}

if (isMain()) {
  const dryRun = process.argv.includes("--dry-run");
  const address = selectPrivateLanAddress(parseInterfaces(os.networkInterfaces()));
  const iosDirExists = existsSync(new URL("./ios", import.meta.url));
  const plan = planIosDeviceRun({ address, iosDirExists });

  if (!plan.ok) {
    console.error(`ios-device: ${plan.error}`);
    process.exit(1);
  }

  console.log(`ios-device: LAN address ${plan.address}:${DEV_BACKEND_PORT}`);
  for (const [key, value] of Object.entries(plan.env)) {
    console.log(`  env ${key}=${value}`);
  }
  for (const step of plan.steps) {
    console.log(`  step ${step.name}: ${step.command}`);
  }

  if (dryRun) {
    console.log("ios-device: dry run — nothing started, nothing built.");
    process.exit(0);
  }

  for (const step of plan.steps) {
    const result = spawnSync(step.command, {
      shell: true,
      stdio: "inherit",
      env: { ...process.env, ...plan.env },
    });
    if (result.status !== 0) {
      console.error(`ios-device: step "${step.name}" failed with exit ${result.status}`);
      process.exit(result.status ?? 1);
    }
  }
}