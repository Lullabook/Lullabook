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
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
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

export function checkBaseline(data: PerfBaseline): PathCheck[] {
  return Object.entries(GATES).map(([name, gate]) => {
    const rec = data.paths[name];
    const sorted = [...(rec?.samples ?? [])].sort((a, b) => a - b);
    const p95 = rec && sorted.length > 0 ? percentile(sorted, 95) : null;
    const limit = gate.limitBytes ?? gate.thresholdMs ?? null;
    const pass =
      rec !== undefined &&
      sorted.length >= 20 &&
      p95 !== null &&
      limit !== null &&
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
