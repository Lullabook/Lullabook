#!/usr/bin/env node
/**
 * Issue 223 — the EVIDENCE HARNESS for the full-likeness family demo (PRD v23).
 *
 * A deterministic collector + checker. It does NOT run the live session — the
 * live session is run elsewhere and drops its evidence on disk; this script
 * gathers whatever demo evidence exists, evaluates EVERY PRD v23 invariant by
 * name (each `held`, `violated`, or `unproven` — never silently skipped),
 * independently verifies COST-1 (the $20 cap from the spend ledger) and ENT-1
 * (demo Pro arrived through the server-authoritative grant route, checked
 * against the code path — not a client flag), and writes DEMO-EVIDENCE.md with
 * a verdict section.
 *
 * Verdict semantics (the honest contract): PASS only if every required evidence
 * item is present AND valid AND no invariant is reported `violated`. Otherwise
 * BLOCKED, with each missing/invalid item named. Because no live session has
 * happened, a real run of this script reports BLOCKED by design; a deterministic
 * pass alone never counts as the demo.
 *
 * Well-known evidence paths (documented; relative to origin/evidence dir root):
 *
 *   session.json          — recorded Simulator session reference + journey facts
 *   fal-requests.json     — array of the five fal.ai training request ids
 *   spend-ledger.json     — { capUsd, totalSpendUsd, requestIds[], reconciledAt }
 *   latency.json          — measured p95s: coldStart/pageTurn (native, LAT-4)
 *                           and optional server/training timings (LAT-1/2/3/5/6/7)
 *   run-approved.json     — { liveProviderRunApproved: boolean } (COST-2)
 *   pro-grant.json        — { method, route } demo-Pro grant provenance (ENT-1)
 *   verifications.json    — per-invariant recorded status for the live/structural
 *                           invariants that a session demonstrates or a code audit
 *                           establishes (FAIL-*, SEC-*, COST-3, and any other
 *                           recorded-in-session invariant)
 *
 * Usage:
 *   node scripts/demo-evidence.mjs                        # repo defaults
 *   node scripts/demo-evidence.mjs --evidence-dir <dir> --out <path>
 *   node scripts/demo-evidence.mjs --print-fixture        # emit a complete sample
 *
 * Exit code: 0 when PASS, 1 when BLOCKED (or a fatal read error).
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_EVIDENCE_DIR = join(REPO_ROOT, "demo-evidence");
const DEFAULT_OUT = join(REPO_ROOT, "CONTEXT/handoffs/DEMO-EVIDENCE.md");
const DEMO_PRO_ROUTE_SRC = join(REPO_ROOT, "src/app/api/billing/demo-pro/route.ts");

// ---------------------------------------------------------------------------
// Required evidence items. PASS requires each present AND valid.
// ---------------------------------------------------------------------------
export const REQUIRED_EVIDENCE = [
  {
    id: "session-recording",
    file: "session.json",
    desc: "a recorded Simulator session reference spanning sign-in to a finished 12-Page Storybook",
  },
  {
    id: "fal-request-ids",
    file: "fal-requests.json",
    desc: "five fal.ai training request ids",
  },
  {
    id: "spend-ledger-under-cap",
    file: "spend-ledger.json",
    desc: "reconciled total live fal spend recorded and under the $20 cap (COST-1)",
  },
  {
    id: "native-latency",
    file: "latency.json",
    desc: "native cold start p95 < 3s and Page turn p95 < 100ms (LAT-4)",
  },
  {
    id: "pro-grant-server-authoritative",
    file: "pro-grant.json",
    desc: "demo Pro obtained via the server-authoritative grant route, not a client flag (ENT-1)",
  },
];

// ---------------------------------------------------------------------------
// PRD v23 named invariants (the full falsifiable list — all 29).
// ---------------------------------------------------------------------------
export const INVARIANTS = [
  { name: "LAT-1", desc: "POST /api/storybooks returns a persisted job, p95 < 2s, no provider work inline" },
  { name: "LAT-2", desc: "Story text generation p95 < 25s" },
  { name: "LAT-3", desc: "Full twelve-Page production-like generation p95 < 90s, after Personas are ready" },
  { name: "LAT-4", desc: "Native cold start p95 < 3s; Page turn p95 < 100ms" },
  { name: "LAT-5", desc: "One Persona LoRA training completes or fails terminally within 25 min wall clock, with a visible progress state" },
  { name: "LAT-6", desc: "A verified training callback is processed and Persona state advanced within 30s of receipt" },
  { name: "LAT-7", desc: "Roster read for a 5-Persona Family p95 < 500ms, payload < 500KB" },
  { name: "FAIL-1", desc: "Every Story reaches draft or failed; no Story stays generating past the watchdog" },
  { name: "FAIL-2", desc: "Invalid or contract-violating Story text fails before any image spend" },
  { name: "FAIL-3", desc: "fal training 4xx/5xx/timeout/malformed artifact → durable failed state + Retry; no partial Persona, orphaned blob, or double spend" },
  { name: "FAIL-4", desc: "Callback never arrives → a watchdog polls fal.ai for terminal status within LAT-5" },
  { name: "FAIL-5", desc: "Duplicate, stale, out-of-order, or unsigned callbacks rejected; never advance state or spend twice" },
  { name: "FAIL-6", desc: "Vercel/public callback URL unreachable → training submission fails closed before money is spent" },
  { name: "FAIL-7", desc: "Anthropic 5xx/rate-limit → retry twice with backoff, then mark Brief failed with provider_unavailable; no image spend after a failed text step" },
  { name: "FAIL-8", desc: "A Brief saved while Personas train resumes exactly once after every selected Persona is confirmed, surviving a restart" },
  { name: "FAIL-9", desc: "Moderation rejects a source photo → no owned blob persists, no provider call, Guardian sees the rejected photo" },
  { name: "SEC-1", desc: "Provider credentials server-side only; never in the Expo bundle or a client response" },
  { name: "SEC-2", desc: "No minor's photo reaches storage or a provider before that minor's own verified parental consent receipt and moderation" },
  { name: "SEC-3", desc: "An Adult Persona requires the subject's own self-consent; a Guardian attestation never stands in" },
  { name: "SEC-4", desc: "Training callbacks authenticated by timestamp, body hash, and signature before any business data is parsed" },
  { name: "SEC-5", desc: "Per-Family isolation enforced by row-level security, not only application checks" },
  { name: "SEC-6", desc: "Hard-delete propagates across database, owned blobs, and provider-held artifacts" },
  { name: "SEC-7", desc: "Roster and reader responses return generated avatars/Page art, never a raw uploaded source photo" },
  { name: "SEC-8", desc: "Minor status decided by the configured child-age threshold for the Family's jurisdiction; nothing hardcoded" },
  { name: "SEC-9", desc: "Consent receipt for a minor records the consenting adult's identity, and that adult is the account-holding parent" },
  { name: "ENT-1", desc: "Demo Pro is a server-authoritative grant; the entitlement gate is exercised, never bypassed by a client flag or build-time bypass" },
  { name: "COST-1", desc: "Cumulative live fal.ai spend hard-capped at $20, enforced by a pre-attempt fail-closed reservation" },
  { name: "COST-2", desc: "No live provider call runs without LIVE_PROVIDER_RUN_APPROVED set for that run" },
  { name: "COST-3", desc: "A second full five-Persona retrain (~$6) must stop and ask the Guardian before it runs" },
];

const VERDICT = { HELD: "held", VIOLATED: "violated", UNPROVEN: "unproven" };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function readJson(dir, file) {
  const path = join(dir, file);
  if (!existsSync(path)) return { present: false, data: null, file, path };
  try {
    return { present: true, data: JSON.parse(readFileSync(path, "utf8")), file, path };
  } catch {
    return { present: true, data: null, file, path, invalid: true };
  }
}

function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isNonNegNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function verdictFromNumber(value, limit, comparison = "<") {
  if (!isNonNegNumber(value)) return VERDICT.UNPROVEN;
  const pass = comparison === "<" ? value < limit : value <= limit;
  return pass ? VERDICT.HELD : VERDICT.VIOLATED;
}

function recordedStatus(verifications, name) {
  if (isRecord(verifications) && isRecord(verifications[name])) {
    const s = verifications[name].status;
    if (s === VERDICT.HELD || s === VERDICT.VIOLATED) return s;
  }
  return VERDICT.UNPROVEN;
}

// ---------------------------------------------------------------------------
// Code-path check for ENT-1: the grant route must be server-authoritative.
// ---------------------------------------------------------------------------
function readDemoProRouteSrc() {
  if (!existsSync(DEMO_PRO_ROUTE_SRC)) return null;
  try {
    return readFileSync(DEMO_PRO_ROUTE_SRC, "utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Collect evidence from the well-known paths.
// ---------------------------------------------------------------------------
export function collectEvidence(evidenceDir) {
  const session = readJson(evidenceDir, "session.json");
  const falRequests = readJson(evidenceDir, "fal-requests.json");
  const spendLedger = readJson(evidenceDir, "spend-ledger.json");
  const latency = readJson(evidenceDir, "latency.json");
  const runApproved = readJson(evidenceDir, "run-approved.json");
  const proGrant = readJson(evidenceDir, "pro-grant.json");
  const verifications = readJson(evidenceDir, "verifications.json");

  return {
    session: session.present ? session.data : null,
    falRequestIds: Array.isArray(falRequests.data) ? falRequests.data : null,
    spendLedger: isRecord(spendLedger.data) ? spendLedger.data : null,
    latency: isRecord(latency.data) ? latency.data : null,
    runApproved: isRecord(runApproved.data) ? runApproved.data : null,
    proGrant: isRecord(proGrant.data) ? proGrant.data : null,
    verifications: isRecord(verifications.data) ? verifications.data : null,
    invalidFiles: [session, falRequests, spendLedger, latency, runApproved, proGrant, verifications]
      .filter((r) => r.present && r.invalid)
      .map((r) => r.file),
  };
}

// ---------------------------------------------------------------------------
// Evaluate every invariant. Returns { name, desc, verdict, note }.
// ---------------------------------------------------------------------------
export function evaluateEvidence(evidence, demoProRouteSrc) {
  const { falRequestIds, spendLedger, latency, runApproved, proGrant, verifications } = evidence;
  const routeSrc = demoProRouteSrc ?? readDemoProRouteSrc();

  const hasFiveRequests = Array.isArray(falRequestIds) && falRequestIds.length >= 5;

  // ----- independent, measurement/code-driven invariants -----
  const verdicts = [];

  const lat1 = verdictFromNumber(latency?.createResponseP95Ms, 2000);
  const lat2 = verdictFromNumber(latency?.storyTextP95Ms, 25000);
  const lat3 = verdictFromNumber(latency?.generationP95Ms, 90000);
  const cold = verdictFromNumber(latency?.coldStartP95Ms, 3000);
  const pageTurn = verdictFromNumber(latency?.pageTurnP95Ms, 100);
  const lat4 =
    cold === VERDICT.VIOLATED || pageTurn === VERDICT.VIOLATED
      ? VERDICT.VIOLATED
      : cold === VERDICT.UNPROVEN || pageTurn === VERDICT.UNPROVEN
        ? VERDICT.UNPROVEN
        : VERDICT.HELD;
  const lat5 = verdictFromNumber(latency?.trainingWallClockSec, 1500, "<=");
  const lat6 = verdictFromNumber(latency?.callbackProcessedSec, 30);
  const roster = verdictFromNumber(latency?.rosterReadP95Ms, 500);
  const payload = verdictFromNumber(latency?.rosterPayloadKb, 500, "<");
  const lat7 =
    roster === VERDICT.VIOLATED || payload === VERDICT.VIOLATED
      ? VERDICT.VIOLATED
      : roster === VERDICT.UNPROVEN || payload === VERDICT.UNPROVEN
        ? VERDICT.UNPROVEN
        : VERDICT.HELD;

  // COST-1 — from the ledger, independently of any record.
  let cost1 = VERDICT.UNPROVEN;
  let cost1Note = "no spend ledger";
  if (isRecord(spendLedger) && isNonNegNumber(spendLedger.totalSpendUsd) && isNonNegNumber(spendLedger.capUsd)) {
    const under = spendLedger.totalSpendUsd < spendLedger.capUsd;
    cost1 = under ? VERDICT.HELD : VERDICT.VIOLATED;
    cost1Note = `ledger total $${spendLedger.totalSpendUsd.toFixed(2)} vs cap $${spendLedger.capUsd.toFixed(2)}`;
  }

  // COST-2 — a live run (fal requests present) requires the approval opt-in.
  let cost2 = VERDICT.UNPROVEN;
  let cost2Note = "no live run recorded";
  if (Array.isArray(falRequestIds) && falRequestIds.length > 0) {
    if (runApproved && runApproved.liveProviderRunApproved === true) {
      cost2 = VERDICT.HELD;
      cost2Note = `${falRequestIds.length} live request(s) recorded under LIVE_PROVIDER_RUN_APPROVED`;
    } else if (runApproved && runApproved.liveProviderRunApproved === false) {
      cost2 = VERDICT.VIOLATED;
      cost2Note = "live requests recorded while LIVE_PROVIDER_RUN_APPROVED was false";
    } else {
      cost2 = VERDICT.UNPROVEN;
      cost2Note = "live requests recorded but approval flag not documented";
    }
  }

  // ENT-1 — server-authoritative grant, checked against the code path.
  let ent1 = VERDICT.UNPROVEN;
  let ent1Note = "no pro-grant provenance recorded";
  const method = proGrant?.method;
  const usesServerGrant = typeof routeSrc === "string" && routeSrc.includes("grantDemoPro") && !routeSrc.includes("DEV_FORCE_SUBSCRIPTION");
  if (method === "server-authoritative") {
    ent1 = usesServerGrant ? VERDICT.HELD : VERDICT.VIOLATED;
    ent1Note = usesServerGrant
      ? `grant route verified in source (${routeSrc ? "grantDemoPro, no client-flag bypass" : "route source missing"})`
      : "claim of server-authoritative grant unsupported by the code path";
  } else if (method === "client-flag" || method === "build-bypass") {
    ent1 = VERDICT.VIOLATED;
    ent1Note = `grant obtained via ${method} — a client flag/build-time bypass can never satisfy ENT-1`;
  }

  const independent = {
    "LAT-1": lat1,
    "LAT-2": lat2,
    "LAT-3": lat3,
    "LAT-4": lat4,
    "LAT-5": lat5,
    "LAT-6": lat6,
    "LAT-7": lat7,
    "COST-1": cost1,
    "COST-2": cost2,
    "ENT-1": ent1,
  };

  const independentNotes = {
    "LAT-1": latency?.createResponseP95Ms == null ? undefined : `createResponseP95=${latency.createResponseP95Ms}ms (limit 2000ms)`,
    "LAT-2": latency?.storyTextP95Ms == null ? undefined : `storyTextP95=${latency.storyTextP95Ms}ms (limit 25000ms)`,
    "LAT-3": latency?.generationP95Ms == null ? undefined : `generationP95=${latency.generationP95Ms}ms (limit 90000ms)`,
    "LAT-4": latency?.coldStartP95Ms == null && latency?.pageTurnP95Ms == null
      ? undefined
      : `coldStartP95=${latency.coldStartP95Ms ?? "n/a"}ms (limit 3000ms); pageTurnP95=${latency.pageTurnP95Ms ?? "n/a"}ms (limit 100ms)`,
    "LAT-5": latency?.trainingWallClockSec == null ? undefined : `trainingWallClock=${latency.trainingWallClockSec}s (limit 1500s)`,
    "LAT-6": latency?.callbackProcessedSec == null ? undefined : `callbackProcessed=${latency.callbackProcessedSec}s (limit 30s)`,
    "LAT-7": latency?.rosterReadP95Ms == null && latency?.rosterPayloadKb == null
      ? undefined
      : `rosterReadP95=${latency.rosterReadP95Ms ?? "n/a"}ms (limit 500ms); payload=${latency.rosterPayloadKb ?? "n/a"}KB (limit 500KB)`,
    "COST-1": cost1Note,
    "COST-2": cost2Note,
    "ENT-1": ent1Note,
  };

  for (const inv of INVARIANTS) {
    let verdict;
    let note;
    if (Object.prototype.hasOwnProperty.call(independent, inv.name)) {
      verdict = independent[inv.name];
      note = independentNotes[inv.name];
    } else {
      // FAIL-* / SEC-* / COST-3 — recorded in the session's verifications.json.
      verdict = recordedStatus(verifications, inv.name);
      note = isRecord(verifications) && isRecord(verifications[inv.name])
        ? verifications[inv.name].note
        : undefined;
    }
    verdicts.push({ name: inv.name, desc: inv.desc, verdict, note });
  }

  return { verdicts, hasFiveRequests };
}

// ---------------------------------------------------------------------------
// Required-item checks → PASS/BLOCKED.
// ---------------------------------------------------------------------------
export function evalRequiredItems(evidence, invariantVerdicts) {
  const checks = REQUIRED_EVIDENCE.map((req) => {
    let present = false;
    let valid = false;
    let value = null;

    switch (req.id) {
      case "session-recording":
        present = isRecord(evidence.session) && typeof evidence.session.recording === "string" && evidence.session.recording.length > 0;
        valid = present;
        value = evidence.session ?? null;
        break;
      case "fal-request-ids":
        present = Array.isArray(evidence.falRequestIds);
        valid = present && evidence.falRequestIds.length >= 5;
        value = evidence.falRequestIds;
        break;
      case "spend-ledger-under-cap":
        present = isRecord(evidence.spendLedger);
        valid = present && isNonNegNumber(evidence.spendLedger.totalSpendUsd) && evidence.spendLedger.totalSpendUsd < evidence.spendLedger.capUsd;
        value = evidence.spendLedger;
        break;
      case "native-latency": {
        const c = evidence.latency?.coldStartP95Ms;
        const pt = evidence.latency?.pageTurnP95Ms;
        present = isRecord(evidence.latency);
        valid = present && isNonNegNumber(c) && c < 3000 && isNonNegNumber(pt) && pt < 100;
        value = evidence.latency;
        break;
      }
      case "pro-grant-server-authoritative":
        present = isRecord(evidence.proGrant);
        valid = present && evidence.proGrant.method === "server-authoritative";
        value = evidence.proGrant;
        break;
      default:
        break;
    }

    return { id: req.id, file: req.file, desc: req.desc, present, valid, value };
  });

  const anyViolated = invariantVerdicts.some((v) => v.verdict === VERDICT.VIOLATED);
  const missingOrInvalid = checks.filter((c) => !c.valid);
  const verdict = missingOrInvalid.length === 0 && !anyViolated ? "PASS" : "BLOCKED";
  const missingItems = missingOrInvalid.map((c) =>
    c.present ? `invalid:${c.id}` : `missing:${c.id}`,
  );
  return { checks, anyViolated, verdict, missingItems };
}

// ---------------------------------------------------------------------------
// Markdown renderer.
// ---------------------------------------------------------------------------
export function renderMarkdown(evidence, outcome) {
  const lines = [];

  lines.push("# Demo Evidence Report — Issue 223 (PRD v23 full-likeness demo)");
  lines.push("");
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Verdict: **${outcome.verdict}**`);
  lines.push("");
  lines.push(`> ${outcome.verdict === "PASS" ? "PASS" : "BLOCKED"}: ${outcome.verdict === "PASS" ? "Every required live evidence item is present and valid, and no invariant is violated." : "This report is BLOCKED by design: no live Simulator session has produced the required evidence. A deterministic pass alone never counts as the demo."}`);
  lines.push("");

  lines.push("## Required live evidence");
  lines.push("");
  lines.push("| Item | File | Status | Requirement |");
  lines.push("|---|---|---|---|");
  for (const c of outcome.checks) {
    const status = c.valid ? "present ✓" : !c.present ? "missing ✗" : "invalid ✗";
    lines.push(`| ${c.id} | \`${c.file}\` | ${status} | ${c.desc} |`);
  }
  lines.push("");

  lines.push("## PRD v23 invariant verdicts (all 29, none skipped)");
  lines.push("");
  lines.push("| Invariant | Verdict | Description | Note |");
  lines.push("|---|---|---|---|");
  for (const v of outcome.verdicts) {
    lines.push(`| ${v.name} | ${v.verdict} | ${v.desc} | ${v.note ?? ""} |`);
  }
  lines.push("");

  lines.push("## Independent verification");
  lines.push("");
  const cost1v = outcome.verdicts.find((v) => v.name === "COST-1");
  const ent1v = outcome.verdicts.find((v) => v.name === "ENT-1");
  lines.push(`- **COST-1** ($20 cap from the ledger): ${cost1v.verdict} — ${cost1v.note ?? ""}`);
  lines.push(`- **ENT-1** (server-authoritative grant, code-path checked): ${ent1v.verdict} — ${ent1v.note ?? ""}`);
  lines.push("");

  if (outcome.verdict === "BLOCKED") {
    lines.push("## Blocked on — missing / invalid evidence");
    lines.push("");
    for (const m of outcome.missingItems) {
      lines.push(`- ${m}`);
    }
    if (outcome.anyViolated) {
      lines.push("");
      lines.push("Violated invariant(s):");
      for (const v of outcome.verdicts.filter((v) => v.verdict === "violated")) {
        lines.push(`- **${v.name}** — ${v.desc}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Orchestrator / CLI
// ---------------------------------------------------------------------------
export function runEvidenceCollector({ evidenceDir, out, write = true }) {
  const evidence = collectEvidence(evidenceDir);
  const { verdicts } = evaluateEvidence(evidence, null);
  const outcome = evalRequiredItems(evidence, verdicts);
  const markdown = renderMarkdown(evidence, { ...outcome, verdicts });

  if (write) {
    writeFileSync(out, `${markdown}\n`, "utf8");
  }
  return { evidence, outcome, verdicts, markdown };
}

function findArg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function printFixture() {
  const fixture = {
    "session.json": {
      recording: "demo-evidence/simulator-2026-08-08.mov",
      simulatorSession: "iOS-Simulator-EFG-123",
      journey: "sign-in → 5-Persona roster → 5 LoRA trainings → 12-Page Storybook",
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
  for (const inv of INVARIANTS) {
    if (["LAT-1", "LAT-2", "LAT-3", "LAT-4", "LAT-5", "LAT-6", "LAT-7", "COST-1", "COST-2", "ENT-1"].includes(inv.name)) continue;
    fixture["verifications.json"][inv.name] = { status: "held", note: "demonstrated on the live path" };
  }
  process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--print-fixture")) {
    printFixture();
    process.exit(0);
  }
  const evidenceDir = findArg(args, "--evidence-dir") ?? DEFAULT_EVIDENCE_DIR;
  const out = findArg(args, "--out") ?? DEFAULT_OUT;

  const { outcome, verdicts } = runEvidenceCollector({ evidenceDir, out });

  const held = verdicts.filter((v) => v.verdict === "held").length;
  const violated = verdicts.filter((v) => v.verdict === "violated").length;
  const unproven = verdicts.filter((v) => v.verdict === "unproven").length;

  console.log(`Demo evidence checker (issue 223)`);
  console.log(`  evidence dir: ${evidenceDir}`);
  console.log(`  wrote: ${out}`);
  console.log(`  invariants: ${held} held, ${violated} violated, ${unproven} unproven`);
  if (outcome.verdict === "PASS") {
    console.log(`  VERDICT: PASS — every required live evidence item present and valid; no invariant violated.`);
    process.exit(0);
  }
  console.log(`  VERDICT: BLOCKED — ${outcome.missingItems.length} missing/invalid item(s) or a violated invariant; a deterministic pass never counts as the demo.`);
  for (const m of outcome.missingItems) console.log(`    - ${m}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
