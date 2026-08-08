import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Issue 223 — the EVIDENCE HARNESS (the live session itself reports BLOCKED by
 * design).
 *
 * The harness (scripts/demo-evidence.mjs) gathers whatever demo evidence exists
 * on disk, evaluates EVERY PRD v23 invariant by name, checks COST-1 from the
 * spend ledger and ENT-1 against the code path, and writes DEMO-EVIDENCE.md with
 * a verdict that is PASS only when every required live item is present and valid
 * and no invariant is violated and no invariant verdict is left unproven —
 * otherwise BLOCKED with each missing/invalid item named.
 *
 * Because no live Simulator session has happened, the harness reports BLOCKED.
 * These tests prove that contract: a missing item ⇒ BLOCKED (never PASS), a
 * fabricated-complete fixture ⇒ the PASS path works end to end, spend over cap ⇒
 * COST-1 violated, an entitlement granted through a client flag ⇒ ENT-1 violated,
 * and a fixture with just one verifications.json entry missing ⇒ BLOCKED (the
 * unproven invariant can never pass). Runs the real .mjs as a subprocess so the
 * artifact itself is tested.
 */

const SCRIPT = resolve(process.cwd(), "scripts/demo-evidence.mjs");

/** Every PRD v23 named invariant, in spec order (must all appear with a verdict). */
const INVARIANT_NAMES = [
  "LAT-1", "LAT-2", "LAT-3", "LAT-4", "LAT-5", "LAT-6", "LAT-7",
  "FAIL-1", "FAIL-2", "FAIL-3", "FAIL-4", "FAIL-5", "FAIL-6", "FAIL-7", "FAIL-8", "FAIL-9",
  "SEC-1", "SEC-2", "SEC-3", "SEC-4", "SEC-5", "SEC-6", "SEC-7", "SEC-8", "SEC-9",
  "ENT-1",
  "COST-1", "COST-2", "COST-3",
];

/** Invariants the harness evaluates independently of verifications.json. */
const INDEPENDENT = new Set([
  "LAT-1", "LAT-2", "LAT-3", "LAT-4", "LAT-5", "LAT-6", "LAT-7",
  "COST-1", "COST-2", "ENT-1",
]);

function completeEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    "session.json": {
      recording: "demo-evidence/simulator-2026-08-08.mov",
      simulatorSession: "iOS-Simulator-EFG-123",
      journey: "sign-in → 5-Persona roster → 5 LoRA trainings → 12-Page Storybook",
      journeyFacts: { pages: 12, personas: 5, trainings: 5 },
    },
    "fal-requests.json": ["fal-rq-1", "fal-rq-2", "fal-rq-3", "fal-rq-4", "fal-rq-5"],
    "spend-ledger.json": {
      capUsd: 20,
      totalSpendUsd: 14.6,
      requestIds: ["fal-rq-1", "fal-rq-2", "fal-rq-3", "fal-rq-4", "fal-rq-5"],
      reconciledAt: "2026-08-08T15:00:00Z",
    },
    "latency.json": {
      coldStartP95Ms: 2100,
      pageTurnP95Ms: 82,
      createResponseP95Ms: 900,
      storyTextP95Ms: 14000,
      generationP95Ms: 70000,
      rosterReadP95Ms: 320,
      rosterPayloadKb: 180,
      trainingWallClockSec: 900,
      callbackProcessedSec: 12,
    },
    "run-approved.json": { liveProviderRunApproved: true },
    "pro-grant.json": { method: "server-authoritative", route: "POST /api/billing/demo-pro" },
    "verifications.json": {},
  };
  for (const name of INVARIANT_NAMES) {
    if (INDEPENDENT.has(name)) continue;
    (base["verifications.json"] as Record<string, unknown>)[name] = {
      status: "held",
      note: "demonstrated on the live path",
    };
  }
  return { ...base, ...overrides };
}

function runHarness(files: Record<string, unknown>): { status: number | null; md: string } {
  const dir = mkdtempSync(join(tmpdir(), "demo-evidence-"));
  for (const [name, data] of Object.entries(files)) {
    if (!data) continue;
    writeFileSync(join(dir, name), JSON.stringify(data, null, 2), "utf8");
  }
  const outPath = join(dir, "DEMO-EVIDENCE.md");
  const res = spawnSync("node", [SCRIPT, "--evidence-dir", dir, "--out", outPath], {
    encoding: "utf8",
  });
  let md = "";
  try {
    md = readFileSync(outPath, "utf8");
  } catch {
    /* not written */
  }
  rmSync(dir, { recursive: true, force: true });
  return { status: res.status, md };
}

function verdictOf(md: string, name: string): "held" | "violated" | "unproven" {
  const line = md.split("\n").find((l) => l.startsWith(`| ${name} |`));
  expect(line, `expected an invariant row for ${name}`).toBeTruthy();
  const verdict = line!.split("|")[2]!.trim();
  expect(["held", "violated", "unproven"]).toContain(verdict);
  return verdict as "held" | "violated" | "unproven";
}

describe("223 — demo evidence harness", () => {
  it("lists every PRD v23 invariant with a verdict (none silently skipped)", () => {
    const { md, status } = runHarness(completeEvidence());
    for (const name of INVARIANT_NAMES) {
      expect(() => verdictOf(md, name)).not.toThrow();
    }
    expect(status).toBe(0);
  });

  it("reports BLOCKED (never PASS) when live evidence is missing, naming each missing item", () => {
    const { md, status } = runHarness({});
    expect(md).toMatch(/BLOCKED/);
    expect(md).not.toMatch(/Verdict: \*\*PASS/);
    expect(status).toBe(1);
    for (const id of [
      "missing:session-recording",
      "missing:fal-request-ids",
      "missing:spend-ledger-under-cap",
      "missing:native-latency",
      "missing:pro-grant-server-authoritative",
    ]) {
      expect(md).toContain(id);
    }
    // The demo-specific invariants are honestly unproven, never omitted or PASSed.
    expect(verdictOf(md, "LAT-4")).toBe("unproven");
    expect(verdictOf(md, "ENT-1")).toBe("unproven");
    expect(verdictOf(md, "COST-1")).toBe("unproven");
  });

  it("a fabricated-complete evidence fixture drives the PASS path end to end", () => {
    const { md, status } = runHarness(completeEvidence());
    expect(status).toBe(0);
    expect(md).toMatch(/Verdict: \*\*PASS/);
    for (const name of INVARIANT_NAMES) {
      expect(verdictOf(md, name)).toBe("held");
    }
    for (const id of [
      "session-recording",
      "fal-request-ids",
      "spend-ledger-under-cap",
      "native-latency",
      "pro-grant-server-authoritative",
    ]) {
      expect(md).toContain(id);
    }
  });

  it("a deterministic but empty run never counts as the demo — BLOCKED even with a healthy harness", () => {
    const { md, status } = runHarness({});
    expect(md).toMatch(/BLOCKED/);
    expect(status).toBe(1);
  });

  it("spend over the $20 cap is reported violated (COST-1) and the ledger item invalid → BLOCKED", () => {
    const fixture = completeEvidence();
    fixture["spend-ledger.json"] = {
      capUsd: 20,
      totalSpendUsd: 21.4,
      requestIds: ["a", "b", "c", "d", "e"],
      reconciledAt: "2026-08-08T15:00:00Z",
    };
    const { md, status } = runHarness(fixture);
    expect(verdictOf(md, "COST-1")).toBe("violated");
    expect(md).toContain("invalid:spend-ledger-under-cap");
    expect(md).toMatch(/BLOCKED/);
    expect(status).toBe(1);
  });

  it("an entitlement obtained via a client flag is reported violated (ENT-1) → BLOCKED", () => {
    const fixture = completeEvidence();
    fixture["pro-grant.json"] = {
      method: "client-flag",
      route: "DEV_FORCE_SUBSCRIPTION=active",
    };
    const { md, status } = runHarness(fixture);
    expect(verdictOf(md, "ENT-1")).toBe("violated");
    expect(md).toContain("invalid:pro-grant-server-authoritative");
    expect(md).toMatch(/BLOCKED/);
    expect(status).toBe(1);
  });

  it("a single unproven invariant (one verifications.json entry missing) ⇒ BLOCKED, never PASS", () => {
    const fixture = completeEvidence();
    delete (fixture["verifications.json"] as Record<string, unknown>)["FAIL-4"];
    const { md, status } = runHarness(fixture);
    expect(verdictOf(md, "FAIL-4")).toBe("unproven");
    expect(md).toMatch(/BLOCKED/);
    expect(md).not.toMatch(/Verdict: \*\*PASS/);
    expect(status).toBe(1);
  });

  it("a session.json with a non-empty recording but missing the 12-Page/5-Persona journey facts ⇒ BLOCKED", () => {
    const fixture = completeEvidence();
    (fixture["session.json"] as Record<string, unknown>) = {
      recording: "demo-evidence/simulator-2026-08-08.mov",
      simulatorSession: "iOS-Simulator-EFG-123",
    };
    const { md, status } = runHarness(fixture);
    expect(md).toContain("invalid:session-recording");
    expect(md).toMatch(/BLOCKED/);
    expect(status).toBe(1);
  });
});
