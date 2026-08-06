#!/usr/bin/env node
// Verification-command for issue 209 (local ticket 201).
// Done-condition: the iPhone runbook must not be "confidently wrong" — every
// command, file, and path it cites must actually exist, the required sections
// must be present, the S4 photo warning must precede every photo-upload step,
// and no literal secret may be pasted in. Exits 0 iff all checks pass.
//
// Usage: node scripts/check-iphone-runbook.mjs
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const RUNBOOK = "CONTEXT/local-dev/RUN-ON-IPHONE.md";
const errors = [];

if (!existsSync(join(ROOT, RUNBOOK))) {
  console.error(`FAIL: runbook not found at ${RUNBOOK}`);
  process.exit(1);
}
const lines = readFileSync(join(ROOT, RUNBOOK), "utf8").split("\n");
const text = lines.join("\n");

// 1) Required sections (issue-201 acceptance criteria).
const requiredSections = [
  "## §0 Environment bring-up",
  "## §1 First build and install",
  "## §2 Daily use",
  "## §3 Known expiry and degradation — expected, not bugs",
  "## §4 Safety warning — read before any photo upload",
  "## §5 Failure modes and fixes",
  "## §6 Measured cold start (P4)",
];
for (const s of requiredSections) {
  if (!text.includes(s)) errors.push(`missing required section: "${s}"`);
}

// 2) Required content markers (G1, G2, F6, F4 recovery, F1, F2).
const requiredMarkers = [
  ["7-day expiry recovery", /7 days|7-day|day 8/],
  ["recovery command (npm run ios:device)", /npm run ios:device/],
  ["Sign in with Apple dead control (G1)", /Sign in with Apple renders but fails|signs in.*fails/i],
  ["universal-link gap (G2)", /universal links? do not open/i],
  ["macOS firewall symptom + fix (F6)", /Downloading bundle/],
  ["no-LAN-address symptom (F1)", /Refusing to fall back/],
  ["device-not-found symptom (F2)", /never\s+silently\s+falls?\s+back\s+to\s+the\s+Simulator/i],
];
for (const [label, re] of requiredMarkers) {
  if (!re.test(text)) errors.push(`missing required content: ${label}`);
}

// 3) S4 warning precedes the first photo-upload step (hard requirement).
//    The §4 heading and the warning banner itself are not upload steps.
const warningLine = lines.findIndex((l) =>
  /⚠ WARNING — `npm run dev:all` bypasses safety gates/.test(l)
);
const firstUploadLine = lines.findIndex(
  (l) =>
    /upload/i.test(l) &&
    /photo|image|reference/i.test(l) &&
    !/WARNING/.test(l) &&
    !/^## §4/.test(l),
);
if (warningLine === -1) {
  errors.push("missing S4 warning banner");
} else if (firstUploadLine === -1) {
  errors.push("no photo-upload step found to order the S4 warning against");
} else if (warningLine >= firstUploadLine) {
  errors.push(
    `S4 warning must precede the first photo-upload step (warning at line ${warningLine + 1}, upload at line ${firstUploadLine + 1})`,
  );
}

// 4) Every `npm run <script>` must exist in root or mobile package.json.
const scriptsOf = (pkg) => {
  try {
    return Object.keys(JSON.parse(readFileSync(join(ROOT, pkg), "utf8")).scripts || {});
  } catch {
    return [];
  }
};
const knownScripts = new Set([...scriptsOf("package.json"), ...scriptsOf("mobile/package.json")]);
for (const m of new Set([...text.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((x) => x[1]))) {
  if (!knownScripts.has(m)) errors.push(`references "npm run ${m}" but no such script in root/mobile package.json`);
}

// 5) Every backtick-wrapped repo path (has a "/" and a file extension) must exist.
const pathRe = /`([\w./-]+\.(?:md|sql|ts|tsx|mjs|json|sh))`/g;
for (const m of new Set([...text.matchAll(pathRe)].map((x) => x[1]))) {
  if (!m.includes("/")) continue; // skip bare filenames (ambiguous location)
  if (!existsSync(join(ROOT, m))) errors.push(`references file "${m}" which does not exist`);
}

// 6) No literal secret pasted (same rule as check-hitl-runbook.mjs).
const secretRe = /\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|_KEY|SERVICE_ROLE)[A-Z0-9_]*)\s*=\s*([^\s<`#]+)/g;
for (const m of text.matchAll(secretRe)) {
  const val = m[2];
  const placeholder = /^<.*>$|^your|^\.\.\.$|^name$/i.test(val);
  if (!placeholder) errors.push(`possible secret value committed: ${m[1]}=${val} (use the name only)`);
}

if (errors.length) {
  console.error(`FAIL — iPhone runbook check found ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("PASS — iPhone runbook is internally consistent (sections, S4 ordering, commands, paths, no secrets).");
process.exit(0);
