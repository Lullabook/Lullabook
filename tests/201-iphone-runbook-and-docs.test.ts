import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Issue 209 / local ticket 201 — iPhone runbook and Expo Go docs correction.
 *
 * The runbook must be usable by someone who has never signed an iOS app, and
 * the checker (`scripts/check-iphone-runbook.mjs`) must fail when the runbook
 * drifts: missing required sections, S4 warning after the first photo-upload
 * step, a cited file/script that does not exist, or a committed secret.
 */
describe("201 — iPhone runbook and docs", () => {
  const ROOT = process.cwd();
  const runbookPath = join(ROOT, "CONTEXT/local-dev/RUN-ON-IPHONE.md");

  it("runbook exists and the checker passes on it", () => {
    expect(existsSync(runbookPath)).toBe(true);
    const result = execFileSync("node", ["scripts/check-iphone-runbook.mjs"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(result).toContain("PASS");
  });

  it("runbook documents the 7-day expiry and its one-command recovery", () => {
    const text = readFileSync(runbookPath, "utf-8");
    expect(text).toMatch(/7 days?/);
    expect(text).toMatch(/npm run ios:device/);
    expect(text).toMatch(/no code is lost/i);
  });

  it("runbook documents G1/G2 as expected behaviour and the F6 firewall fix", () => {
    const text = readFileSync(runbookPath, "utf-8");
    expect(text).toMatch(/Sign in with Apple/i);
    expect(text).toMatch(/expected|not a bug/i);
    expect(text).toMatch(/universal links/i);
    expect(text).toMatch(/Downloading bundle/i);
    expect(text).toMatch(/Firewall/i);
  });

  it("mobile/README.md no longer instructs the reader to use Expo Go, and states why", () => {
    const readme = readFileSync(join(ROOT, "mobile/README.md"), "utf-8");
    // States why: Expo Go is dead for SDK 56.
    expect(readme).toMatch(/Expo Go is dead/i);
    // Never instructs the reader to use Expo Go to run the app.
    expect(readme).not.toMatch(/(use|open|run).{0,40}expo\s+go/i);
    expect(readme).toMatch(/ios:device/);
  });

  it("CONTEXT/state.md records Expo Go is dead for SDK 56 and names ios:device", () => {
    const state = readFileSync(join(ROOT, "CONTEXT/state.md"), "utf-8");
    expect(state).toMatch(/Expo Go/i);
    expect(state).toMatch(/ios:device/);
  });
});
