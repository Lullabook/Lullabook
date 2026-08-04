/**
 * Issue 191 — checked-in performance baseline checker.
 *
 * Reads perf-baseline.json and fails (exit 1) unless every recorded p95
 * stays under its threshold:
 *
 *   cold start        < 3000ms   (PERF-4)
 *   create response   < 2000ms   (PERF-1)
 *   story text        < 25000ms  (PERF-2)
 *   12-page generation< 90000ms  (PERF-2)
 *   page turn         < 100ms    (PERF-4)
 *   story detail      < 500KB    (PERF-4, wire bytes)
 *
 * The check logic is pure and imported by tests/191-…; the CLI runs it
 * against the checked-in file. Deterministic — no wall-clock measurement.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface PerfPathRecord {
  method: string;
  fixtureSize: string;
  samples: number[];
  sampleCount?: number;
  result: string;
}

export interface PerfBaseline {
  profile: { name: string; os?: string; node?: string; method: string; capturedAt?: string };
  paths: Record<string, PerfPathRecord>;
}

export interface PathCheck {
  path: string;
  p95: number | null;
  limit: number | null;
  pass: boolean;
}

/** Nearest-rank percentile of a sorted sample array (deterministic). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const safePercentile = Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((safePercentile / 100) * sorted.length) - 1)
  );
  return Number.isFinite(sorted[idx]) ? sorted[idx] : 0;
}

/** The six gated paths from the ticket. Home/story-list are recorded, not gated. */
export const GATES: Record<string, { thresholdMs?: number; limitBytes?: number }> = {
  "cold-start": { thresholdMs: 3000 },
  "create-response": { thresholdMs: 2000 },
  "story-text": { thresholdMs: 25000 },
  "12-page-generation": { thresholdMs: 90000 },
  "page-turn": { thresholdMs: 100 },
  "story-detail": { limitBytes: 512000 },
};

const RECORDED_PATHS = [
  "cold-start",
  "create-response",
  "home",
  "story-list",
  "story-detail",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidProfile(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.name) || !isNonEmptyString(value.method)) {
    return false;
  }
  return ["os", "node", "capturedAt"].every(
    (key) => value[key] === undefined || typeof value[key] === "string"
  );
}

function isFiniteSample(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidPathRecord(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.samples)) return false;
  return (
    value.samples.length >= 20 &&
    value.samples.every(isFiniteSample) &&
    isNonEmptyString(value.method) &&
    isNonEmptyString(value.fixtureSize) &&
    value.result === "PASS" &&
    Number.isInteger(value.sampleCount) &&
    value.sampleCount === value.samples.length
  );
}

export function checkBaseline(data: PerfBaseline): PathCheck[] {
  const root: Record<string, unknown> = isRecord(data) ? data : {};
  const paths = isRecord(root["paths"]) ? root["paths"] : {};
  const profileValid = isValidProfile(root["profile"]);
  const recordedPathsValid = RECORDED_PATHS.every((name) => isValidPathRecord(paths[name]));

  return Object.entries(GATES).map(([name, gate]) => {
    const raw = paths[name];
    const rec = isRecord(raw) ? raw : null;
    const rawSamples = rec?.samples;
    const samplesValid =
      Array.isArray(rawSamples) && rawSamples.length > 0 && rawSamples.every(isFiniteSample);
    const samples = samplesValid ? (rawSamples as number[]) : [];
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = samplesValid ? percentile(sorted, 95) : null;
    const metadataValid =
      rec !== null &&
      isNonEmptyString(rec.method) &&
      isNonEmptyString(rec.fixtureSize) &&
      rec.result === "PASS" &&
      Number.isInteger(rec.sampleCount) &&
      rec.sampleCount === samples.length;
    const limit = gate.limitBytes ?? gate.thresholdMs ?? null;
    const pass =
      profileValid &&
      recordedPathsValid &&
      metadataValid &&
      sorted.length >= 20 &&
      p95 !== null &&
      limit !== null &&
      Number.isFinite(p95) &&
      p95 < limit;
    return { path: name, p95, limit, pass };
  });
}

function main(): void {
  const file = path.resolve(process.cwd(), "perf-baseline.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as PerfBaseline;
  const results = checkBaseline(data);
  let failed = 0;
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed += 1;
    console.log(`${status} ${r.path}: p95=${r.p95} limit=${r.limit}`);
  }
  if (failed > 0) {
    console.error(`Perf baseline FAILED (${failed} path(s) over threshold)`);
    process.exit(1);
  }
  console.log("Perf baseline OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
