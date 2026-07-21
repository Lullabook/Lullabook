#!/usr/bin/env npx tsx
/**
 * Prints the incremental schema path and opens the Supabase SQL editor for the
 * project in .env.local (macOS). Run: npx tsx tools/print-db-migrate.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env.local");
const sqlPaths = [
  path.join(root, "CONTEXT/local-dev/schema-incremental-004-007.sql"),
  path.join(root, "CONTEXT/local-dev/schema-incremental-008-011.sql"),
  path.join(root, "CONTEXT/local-dev/schema-incremental-012.sql"),
];

if (!existsSync(envPath)) {
  console.error("Missing .env.local — see CONTEXT/local-dev/RUN-LOCAL.md");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!ref) {
  console.error("Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const editorUrl = `https://supabase.com/dashboard/project/${ref}/sql/new`;
console.log("\nDatabase schema is outdated. Apply the incremental migrations (in order):\n");
console.log(`  1. Open: ${editorUrl}`);
console.log("  2. Paste and Run the contents of each (in order; both are idempotent):");
for (const p of sqlPaths) console.log(`     ${p}`);
console.log("  3. Then refresh http://localhost:3000\n");

try {
  execSync(`open "${editorUrl}"`, { stdio: "ignore" });
  execSync(`open -R "${sqlPaths[sqlPaths.length - 1]}"`, { stdio: "ignore" });
} catch {
  // non-macOS or headless — URLs above are enough
}
