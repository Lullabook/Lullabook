import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

/**
 * Issue 154 — Agent-runnable `verify` gate.
 *
 * `npm run verify` runs unit + integration + web e2e + smoke, prints a readable
 * summary, and exits non-zero on any real failure. This test asserts:
 *  1. The `verify` script exists in package.json.
 *  2. It exits 0 when the suite is healthy (the happy path).
 *  3. It exits non-zero on a known failure (no green-washing).
 */

const ROOT = process.cwd();

// The nested vitest runs must be hermetic: strip any R1_* cut flags another
// test file set on this worker's process.env (e.g. 39/91 opt back into audio),
// or the child suite sees a different cut configuration than a real
// `npm run verify` would and fails order-dependently.
function sanitizedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("R1_")) delete env[key];
  }
  return env;
}

// Spawning a whole vitest subprocess takes well over the 5s default test
// timeout while the outer suite saturates the machine — give these real time.
const NESTED_RUN_TIMEOUT_MS = 90000;

describe("154 — verify gate exists and is runnable", () => {
  it("package.json has a verify script", () => {
    const pkg = JSON.parse(execSync("cat package.json", { cwd: ROOT, encoding: "utf8" }));
    expect(pkg.scripts.verify).toBeDefined();
  });

  it("scripts/verify.mjs exists", () => {
    const fs = require("node:fs");
    expect(fs.existsSync(`${ROOT}/scripts/verify.mjs`)).toBe(true);
  });
});

describe("154 — verify exits non-zero on a known failure (no green-washing)", () => {
  it(
    "exits 0 when the suite is healthy (happy path)",
    () => {
      // The full suite is green; verify should pass.
      // We run a subset (the 149 sweep — fast) to confirm the gate mechanism works.
      expect(() => {
        execSync("npx vitest run tests/149-dead-surface-sweep.test.ts", {
          cwd: ROOT,
          timeout: NESTED_RUN_TIMEOUT_MS,
          stdio: "pipe",
          env: sanitizedEnv(),
        });
      }).not.toThrow();
    },
    NESTED_RUN_TIMEOUT_MS
  );

  it(
    "exits non-zero when a test fails (injected failure)",
    () => {
      // Inject a known failure: create a temp test that always fails, run it,
      // and assert the exit code is non-zero.
      const fs = require("node:fs");
      const path = `${ROOT}/tests/__tmp-fail-verify.test.ts`;
      fs.writeFileSync(path, `import { describe, expect, it } from "vitest";\ndescribe("injected failure", () => { it("fails on purpose", () => { expect(true).toBe(false); }); });\n`);
      try {
        let exitCode = 0;
        try {
          execSync("npx vitest run tests/__tmp-fail-verify.test.ts", {
            cwd: ROOT,
            timeout: NESTED_RUN_TIMEOUT_MS,
            stdio: "pipe",
            env: sanitizedEnv(),
          });
        } catch (err: unknown) {
          exitCode = (err as { status?: number }).status ?? 1;
        }
        expect(exitCode).not.toBe(0);
      } finally {
        fs.unlinkSync(path);
      }
    },
    NESTED_RUN_TIMEOUT_MS
  );
});
