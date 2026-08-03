import { afterEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BACKEND_PORT,
  READINESS_URL,
  LauncherError,
  resolveWorkspace,
  run,
} from "../scripts/super-engineering-launcher.mjs";

/**
 * Issue 204 / local 196 — Super.Engineering current-workspace iOS launcher.
 *
 * Shell/script contract test: exercises the launcher's decision logic with
 * fakes (fake child processes, fake env, fake readiness server). It never
 * starts Metro, the backend, or the Simulator, and never touches a live
 * provider.
 */

const REPO_ROOT = process.cwd();

interface SpawnRecord {
  cmd: string;
  args: string[];
  options: Record<string, unknown>;
  child: FakeChild;
}

interface FakeChild {
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
}

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lullabook-196-"));
  tmpDirs.push(dir);
  return dir;
}

function makeFakeSpawn(spawnLog: SpawnRecord[]) {
  return vi.fn((cmd: string, args: string[], options: Record<string, unknown>) => {
    let killed = false;
    const exitHandlers: Array<() => void> = [];
    const child: FakeChild = {
      pid: 1000 + spawnLog.length,
      killed: false,
      kill: vi.fn((signal?: string) => {
        killed = true;
        child.killed = true;
        for (const handler of exitHandlers) handler();
      }),
      once: vi.fn((event: string, handler: () => void) => {
        if (event === "exit") exitHandlers.push(handler);
      }),
    };
    spawnLog.push({ cmd, args, options, child });
    return child;
  });
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("196 — workspace resolution ($SUPERCONDUCTOR_WORKSPACE_PATH)", () => {
  it("refuses a missing SUPERCONDUCTOR_WORKSPACE_PATH", async () => {
    expect(() => resolveWorkspace({})).toThrow(LauncherError);
    expect(() => resolveWorkspace({})).toThrow(/SUPERCONDUCTOR_WORKSPACE_PATH/);
    // The full run refuses too, and never spawns anything.
    const spawnLog: SpawnRecord[] = [];
    const fakeSpawn = makeFakeSpawn(spawnLog);
    await expect(run({ env: {}, spawnFn: fakeSpawn })).rejects.toThrow(LauncherError);
    expect(spawnLog).toHaveLength(0);
  });

  it("refuses a non-Lullabook workspace", () => {
    // package.json exists but names a different project.
    const foreign = makeTmpDir();
    writeFileSync(join(foreign, "package.json"), JSON.stringify({ name: "not-lullabook" }));
    expect(() => resolveWorkspace({ SUPERCONDUCTOR_WORKSPACE_PATH: foreign })).toThrow(
      LauncherError
    );

    // Right name but missing the mobile app / src tree.
    const hollow = makeTmpDir();
    writeFileSync(join(hollow, "package.json"), JSON.stringify({ name: "lullabook" }));
    expect(() => resolveWorkspace({ SUPERCONDUCTOR_WORKSPACE_PATH: hollow })).toThrow(
      LauncherError
    );
  });

  it("resolves the current workspace when SUPERCONDUCTOR_WORKSPACE_PATH points at a Lullabook checkout", () => {
    expect(resolveWorkspace({ SUPERCONDUCTOR_WORKSPACE_PATH: REPO_ROOT })).toBe(REPO_ROOT);
  });
});

describe("196 — backend port matches the mobile dev profile", () => {
  it("the launcher's backend port is the port consumed by mobile's ios:paid profile", () => {
    const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(rootPkg.scripts["dev:paid"]).toContain(`-p ${BACKEND_PORT}`);
    const mobilePkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "mobile", "package.json"), "utf8")
    );
    const iosPaid = mobilePkg.scripts["ios:paid"];
    expect(iosPaid).toBeDefined();
    const apiUrlMatch = /EXPO_PUBLIC_API_URL=http:\/\/127\.0\.0\.1:(\d+)/.exec(iosPaid);
    expect(apiUrlMatch).not.toBeNull();
    expect(Number(apiUrlMatch![1])).toBe(BACKEND_PORT);
    expect(READINESS_URL).toBe(`http://127.0.0.1:${BACKEND_PORT}/`);
  });
});

describe("196 — happy path: backend → readiness → proxy → iOS command", () => {
  it("starts the backend, waits for HTTP readiness, then starts the IPv4 proxy and the iOS Simulator command, in order", async () => {
    const spawnLog: SpawnRecord[] = [];
    const fakeSpawn = makeFakeSpawn(spawnLog);
    const spawnCountsAtFetch: number[] = [];
    const fakeFetch = vi.fn(async () => {
      spawnCountsAtFetch.push(spawnLog.length);
      return { status: 200 };
    });
    const registeredSignals = new Map<string, () => void>();

    const result = await run({
      env: { SUPERCONDUCTOR_WORKSPACE_PATH: REPO_ROOT },
      spawnFn: fakeSpawn,
      fetchFn: fakeFetch,
      registerSignal: (signal, handler) => registeredSignals.set(signal, handler),
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    // Backend first, on the port consumed by the mobile dev profile.
    expect(spawnLog[0].cmd).toBe("npm");
    expect(spawnLog[0].args).toEqual(["run", "dev:paid"]);
    expect(spawnLog[0].options.cwd).toBe(REPO_ROOT);
    // Readiness was polled (and the backend was the only child when it happened).
    expect(fakeFetch).toHaveBeenCalledWith(READINESS_URL, { method: "GET" });
    expect(spawnCountsAtFetch).toContain(1);
    // Then the IPv4 Metro proxy…
    expect(spawnLog[1].cmd).toBe("node");
    expect(spawnLog[1].args[0]).toBe(join(REPO_ROOT, "mobile", "scripts", "ipv4-metro-proxy.mjs"));
    expect(spawnLog[1].options.cwd).toBe(join(REPO_ROOT, "mobile"));
    // …then the mobile iOS launch command (expo start --ios).
    expect(spawnLog[2].cmd).toBe("npm");
    expect(spawnLog[2].args).toEqual(["run", "ios:paid"]);
    expect(spawnLog[2].options.cwd).toBe(join(REPO_ROOT, "mobile"));

    expect(spawnLog).toHaveLength(3);
    expect(registeredSignals.has("SIGINT")).toBe(true);
    expect(registeredSignals.has("SIGTERM")).toBe(true);
  });
});

describe("196 — failure paths", () => {
  it("a failed readiness check exits non-zero and stops the backend child", async () => {
    const spawnLog: SpawnRecord[] = [];
    const fakeSpawn = makeFakeSpawn(spawnLog);
    const failingFetch = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const result = await run({
      env: { SUPERCONDUCTOR_WORKSPACE_PATH: REPO_ROOT },
      spawnFn: fakeSpawn,
      fetchFn: failingFetch,
      readiness: { timeoutMs: 100, pollMs: 10 },
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    // Only the backend was spawned; it must be stopped.
    expect(spawnLog).toHaveLength(1);
    expect(spawnLog[0].child.kill).toHaveBeenCalled();
  });
});

describe("196 — SIGINT/SIGTERM cleanup", () => {
  it("cleanup kills the backend, proxy, and Metro children and returns the signal's shell exit code", async () => {
    const spawnLog: SpawnRecord[] = [];
    const fakeSpawn = makeFakeSpawn(spawnLog);
    const fakeFetch = vi.fn(async () => ({ status: 200 }));

    const result = await run({
      env: { SUPERCONDUCTOR_WORKSPACE_PATH: REPO_ROOT },
      spawnFn: fakeSpawn,
      fetchFn: fakeFetch,
    });

    expect(spawnLog).toHaveLength(3);
    for (const record of spawnLog) expect(record.child.killed).toBe(false);

    expect(result.cleanup("SIGTERM")).toBe(143);
    for (const record of spawnLog) {
      expect(record.child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(record.child.killed).toBe(true);
    }
    expect(result.cleanup("SIGINT")).toBe(130);
  });
});

describe("196 — credentials hygiene", () => {
  it("passes no env of its own to children (dev-profile credentials only)", async () => {
    const spawnLog: SpawnRecord[] = [];
    const fakeSpawn = makeFakeSpawn(spawnLog);
    const fakeFetch = vi.fn(async () => ({ status: 200 }));

    await run({
      env: { SUPERCONDUCTOR_WORKSPACE_PATH: REPO_ROOT },
      spawnFn: fakeSpawn,
      fetchFn: fakeFetch,
    });

    for (const record of spawnLog) {
      expect(record.options.env).toBeUndefined();
    }
  });

  it("the launcher source never names provider secrets or reads them", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "super-engineering-launcher.mjs"), "utf8");
    for (const secretName of ["ANTHROPIC_API_KEY", "FAL_API_KEY", "SERVICE_ROLE", "STRIPE_SECRET", "RESEND_API_KEY"]) {
      expect(source).not.toContain(secretName);
    }
  });
});

describe("196 — documented Run command for a fresh worktree", () => {
  it("root package.json exposes one super:run command pointing at the launcher", () => {
    const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(rootPkg.scripts["super:run"]).toBe("node scripts/super-engineering-launcher.mjs");
  });

  it("the runbook documents the one-line command and contains no hardcoded personal path", () => {
    const docPath = join(REPO_ROOT, "docs", "super-engineering-ios-launcher.md");
    expect(existsSync(docPath)).toBe(true);
    const doc = readFileSync(docPath, "utf8");
    expect(doc).toContain("npm run super:run");
    expect(doc).toContain("SUPERCONDUCTOR_WORKSPACE_PATH");
    expect(doc).not.toMatch(/\/Users\/|\\Users\\|vraj/i);
  });
});

describe("196 — shell contract without a live provider or simulator", () => {
  it("the real CLI refuses a missing workspace path with a non-zero exit", () => {
    let stderr = "";
    let status = 0;
    try {
      execSync("node scripts/super-engineering-launcher.mjs", {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, SUPERCONDUCTOR_WORKSPACE_PATH: "" },
      });
    } catch (err) {
      const error = err as { stderr?: string | Buffer; status?: number };
      stderr = String(error.stderr ?? "");
      status = error.status ?? 0;
    }
    expect(status).not.toBe(0);
    expect(stderr).toContain("SUPERCONDUCTOR_WORKSPACE_PATH");
  });
});
