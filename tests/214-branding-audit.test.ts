import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Issue 225 / local 214 — Branding audit.
 *
 * "Maya's World" was an internal codename for the design tokens. The shipped
 * product must read as **Lullabook**. This test scans the real user-visible
 * app source — RN screens under `mobile/app`, web screens under `src/app` —
 * and asserts the codename never surfaces in a user-visible string or in app
 * metadata.
 *
 * Documented exception: the demo seed character and hero archetype is named
 * **Maya**. "Maya" the character stays; "Maya's World" the brand goes. Internal
 * comments, token file names, and internal variable names may keep the codename
 * and are deliberately not scanned.
 */

const REPO_ROOT = process.cwd();

const VISIBLE_ROOTS = ["mobile/app", "src/app"];

/** JSX text uses the HTML entity `&apos;` for an apostrophe; normalize both. */
function normalizeApostrophes(s: string): string {
  return s.replace(/&apos;/g, "'").replace(/’/g, "'");
}

/** Strip JS line + block comments so the scan cannot be fooled by comments. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectFiles(p));
    else if (extname(p) === ".tsx" || extname(p) === ".ts") out.push(p);
  }
  return out;
}

function visibleSources(): { path: string; clean: string }[] {
  const files: { path: string; clean: string }[] = [];
  for (const root of VISIBLE_ROOTS) {
    for (const p of collectFiles(join(REPO_ROOT, root))) {
      files.push({
        path: p.replace(REPO_ROOT + "/", ""),
        clean: normalizeApostrophes(stripComments(readFileSync(p, "utf-8"))),
      });
    }
  }
  return files;
}

function visibleFiles(): string[] {
  const files: string[] = [];
  for (const root of VISIBLE_ROOTS) {
    files.push(...collectFiles(join(REPO_ROOT, root)).map((p) => p.replace(REPO_ROOT + "/", "")));
  }
  return files;
}

describe("225/214 — branding audit: no user-visible 'Maya's World' as a product name", () => {
  it("scans user-visible mobile/web source and finds zero codename occurrences", () => {
    const sources = visibleSources();
    // Guard so a refactor of the tree layout fails loudly instead of vacuously passing.
    expect(sources.length).toBeGreaterThan(10);
    const offenders = sources
      .filter(({ clean }) => /maya'?s\s+world/i.test(clean))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("app metadata, document titles, and config all read Lullabook", () => {
    const appConfig = readFileSync(join(REPO_ROOT, "mobile/app.config.ts"), "utf-8");
    const webMetadata = readFileSync(join(REPO_ROOT, "src/app/layout.tsx"), "utf-8");

    expect(appConfig).toMatch(/name:\s*"Lullabook"/);
    expect(appConfig).toMatch(/slug:\s*"lullabook"/);
    expect(appConfig).toMatch(/bundleIdentifier:\s*"com\.lullabook\.app"/);
    expect(webMetadata).toMatch(/title:\s*\{\s*default:\s*"Lullabook"/);
  });

  it("preserves the demo seed character Maya (intentional exception, not a brand)", () => {
    const seed = readFileSync(join(REPO_ROOT, "src/dev/seed-maya-world.ts"), "utf-8");
    const familyNew = readFileSync(join(REPO_ROOT, "mobile/app/family/new.tsx"), "utf-8");

    // The hero character is named Maya and is a character name, not a product name.
    expect(seed).toMatch(/ensureDefaultBaby\(member\.id,\s*"Maya"\)/);
    expect(seed).toMatch(/displayName:\s*"Maya"/);
    // The "Maya" placeholder in the create-character screen is character data.
    expect(familyNew).toMatch(/placeholder=\{kind === "baby" \? "Maya" : "Nadia"\}/);
    // The visible screens must still exist (sanity for the scan above).
    expect(visibleFiles()).toContain("mobile/app/(tabs)/family.tsx");
  });
});
