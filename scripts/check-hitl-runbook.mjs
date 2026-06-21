#!/usr/bin/env node
// Verification-command for issue 82 (and the HITL smoke runbook as 83–87 extend it).
// Done-condition: the runbook must not be "confidently wrong" — every command, file,
// and ADR it cites must actually exist, the required sections must be present, and no
// literal secret may be pasted in. Exits 0 iff all checks pass.
//
// Usage: node scripts/check-hitl-runbook.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const RUNBOOK = "CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md";
const errors = [];

if (!existsSync(join(ROOT, RUNBOOK))) {
  console.error(`FAIL: runbook not found at ${RUNBOOK}`);
  process.exit(1);
}
const text = readFileSync(join(ROOT, RUNBOOK), "utf8");

// 1) Required sections (the issue-82 acceptance criteria + the area scaffolds).
const requiredSections = [
  "## §0 Foundation",
  "### §0.1 Environment bring-up",
  "### §0.2 Env / secrets checklist",
  "### §0.3 OAuth provider prerequisites",
  "### §0.4 Dedicated test Family setup",
  "## Invariants — the PASS/FAIL contract",
  "## Global results summary",
  "## Defect path",
  "## §1 Auth & account",
  "## §2 Family & roster",
  "### §2.x Add-Family photo upload (issue 70)",
  "## §3 Journal / Firsts / Moments",
  "## §4 Storybook generate & reader",
  "## §5 Failure & boundary sweep",
];
for (const s of requiredSections) {
  if (!text.includes(s)) errors.push(`missing required section: "${s}"`);
}

// 2) Every `npm run <script>` must exist in root or mobile package.json.
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

// 3) Every backtick-wrapped repo path (has a "/" and a file extension) must exist.
const pathRe = /`([\w./-]+\.(?:md|sql|ts|tsx|mjs|json|sh))`/g;
for (const m of new Set([...text.matchAll(pathRe)].map((x) => x[1]))) {
  if (!m.includes("/")) continue; // skip bare filenames (ambiguous location)
  if (!existsSync(join(ROOT, m))) errors.push(`references file "${m}" which does not exist`);
}

// 4) Every ADR-00NN citation must resolve to a doc.
const adrDir = "CONTEXT/docs/adr";
const adrFiles = existsSync(join(ROOT, adrDir)) ? readdirSync(join(ROOT, adrDir)) : [];
for (const m of new Set([...text.matchAll(/ADR-(\d{4})/g)].map((x) => x[1]))) {
  if (!adrFiles.some((f) => f.startsWith(m))) errors.push(`cites ADR-${m} but no CONTEXT/docs/adr/${m}-*.md exists`);
}

// 5) No literal secret pasted: a sensitive-looking var assigned a concrete value.
//    Names-only references (no "=") and localhost/placeholder values are allowed.
const secretRe = /\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|_KEY|SERVICE_ROLE)[A-Z0-9_]*)\s*=\s*([^\s<`#]+)/g;
for (const m of text.matchAll(secretRe)) {
  const val = m[2];
  const placeholder = /^<.*>$|^your|^\.\.\.$|^name$/i.test(val);
  if (!placeholder) errors.push(`possible secret value committed: ${m[1]}=${val} (use the name only)`);
}

if (errors.length) {
  console.error(`FAIL — HITL runbook check found ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("PASS — HITL runbook is internally consistent (sections, commands, paths, ADRs, no secrets).");
process.exit(0);
