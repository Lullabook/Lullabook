import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEV_BACKEND_PORT, planIosDeviceRun } from "../mobile/scripts/ios-device.mjs";

/**
 * Issue 208 / local ticket 200 — one-command iPhone device build.
 *
 * The planner is pure: given a detected LAN address and whether `mobile/ios`
 * exists, it returns the environment and the ordered steps. The device command
 * must compose ticket 199's address detection and ticket 198's free-team flag
 * so a human cannot forget either, and must never target the Simulator (F2) or
 * fall back to a loopback/stale address (F1).
 */
describe("200 — ios:device launch plan", () => {
  it("sets LULLABOOK_FREE_TEAM=1 and the API/packager env from the detected address", () => {
    const plan = planIosDeviceRun({ address: "192.168.1.50", iosDirExists: true });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.env.LULLABOOK_FREE_TEAM).toBe("1");
    expect(plan.env.EXPO_PUBLIC_API_URL).toBe(`http://192.168.1.50:${DEV_BACKEND_PORT}`);
    // No scheme and no port on the packager hostname.
    expect(plan.env.REACT_NATIVE_PACKAGER_HOSTNAME).toBe("192.168.1.50");
    expect(plan.env.REACT_NATIVE_PACKAGER_HOSTNAME).not.toMatch(/[:/]/);
  });

  it("prebuilds only when mobile/ios is absent, and never with --clean", () => {
    const cold = planIosDeviceRun({ address: "192.168.1.50", iosDirExists: false });
    const warm = planIosDeviceRun({ address: "192.168.1.50", iosDirExists: true });
    expect(cold.ok && warm.ok).toBe(true);
    if (!cold.ok || !warm.ok) return;
    expect(cold.steps.map((s) => s.name)).toEqual(["prebuild", "run"]);
    expect(warm.steps.map((s) => s.name)).toEqual(["run"]);
    for (const step of [...cold.steps, ...warm.steps]) {
      expect(step.command).not.toContain("--clean");
    }
  });

  it("always targets a physical device and never the Simulator", () => {
    const plan = planIosDeviceRun({ address: "192.168.1.50", iosDirExists: false });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const runStep = plan.steps.find((s) => s.name === "run");
    expect(runStep?.command).toBe("npx expo run:ios --device");
    expect(runStep?.command).not.toContain("--simulator");
  });

  it("fails closed with no command and no API URL when there is no LAN address", () => {
    const plan = planIosDeviceRun({ address: null, iosDirExists: false });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.steps).toHaveLength(0);
    expect(plan.env.EXPO_PUBLIC_API_URL).toBeUndefined();
    expect(Object.keys(plan.env)).not.toContain("EXPO_PUBLIC_API_URL");
  });

  it("never hardcodes the machine address and never writes mobile/.env", () => {
    const files = readdirSync(join(process.cwd(), "mobile/scripts")).filter((f) =>
      f.endsWith(".mjs")
    );
    const sources = files.map((f) => readFileSync(join(process.cwd(), "mobile/scripts", f), "utf-8"));
    for (const src of sources) {
      expect(src).not.toContain("192.168.50.220");
      // No file-write API anywhere: the plan supplies env inline, it never
      // writes mobile/.env (or any other file).
      expect(src).not.toMatch(/writeFile|appendFile|createWriteStream/);
      expect(src).not.toContain("mobile/.env");
    }
  });
});
