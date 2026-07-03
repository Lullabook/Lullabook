import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 156 — Mobile render-layer invariant guards (part3 audit, R1 polish).
 *
 * Two R1 invariants the mobile polish loop fixed/relies on had no source-level
 * regression test. This is the guard (149-style: read the mobile source and
 * assert a structural property, since these are presentation-layer invariants
 * with no server surface to hit):
 *
 *   D1. Reader page-turn < 100ms (latency budget). The fix replaced
 *       `SlideInRight.duration(280).springify()` — springify IGNORES
 *       `.duration()` and settles ~400ms — with a 90ms timing slide. Re-adding
 *       `.springify()` on the page transition, or a duration > 100, silently
 *       blows the budget. Guard it.
 *   D2. Raw child photos are write-only, never rendered (security boundary). A
 *       person's likeness may render ONLY via generated assets (`avatarUrl` /
 *       `illustrationSource`). Any new `<Image>` fed a raw-photo/upload URI
 *       would pass every existing (server-side) gate. Guard it at the render
 *       layer.
 */

const ROOT = process.cwd();
const mobile = (p: string) => join(ROOT, "mobile", p);
const read = (p: string) => readFileSync(p, "utf8");

/** Recursively collect .tsx source files under a mobile subdir. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("156 — D1: reader page-turn stays under the 100ms latency budget", () => {
  const src = read(mobile("components/maya-ui.tsx"));

  /** The body of `export function PageTurn(...)` up to the next `export`. */
  function pageTurnBody(): string {
    const start = src.indexOf("export function PageTurn(");
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start + "export function PageTurn(".length);
    const nextExport = rest.indexOf("\nexport ");
    return nextExport === -1 ? rest : rest.slice(0, nextExport);
  }

  it("the page transition uses no `.springify()` (springify ignores .duration())", () => {
    expect(pageTurnBody()).not.toContain(".springify(");
  });

  it("every `.duration(N)` on the page transition is <= 100ms", () => {
    const body = pageTurnBody();
    const durations = [...body.matchAll(/\.duration\((\d+)\)/g)].map((m) => Number(m[1]));
    // The transition must set a duration (no default-length spring) …
    expect(durations.length).toBeGreaterThan(0);
    // … and every one honors the <100ms budget.
    for (const d of durations) expect(d).toBeLessThanOrEqual(100);
  });
});

describe("156 — D2: no mobile <Image> renders a raw uploaded photo", () => {
  const files = [...tsxFiles(mobile("app")), ...tsxFiles(mobile("components"))];

  it("every <Image> source derives only from generated avatar/illustration helpers", () => {
    // Sanctioned likeness-render helpers (generated assets, never the raw upload).
    const sanctioned = ["avatarUrl(", "illustrationSource(", "source={source}"];
    const imageSites: { file: string; line: string }[] = [];
    for (const file of files) {
      for (const line of read(file).split("\n")) {
        if (line.includes("<Image")) imageSites.push({ file, line: line.trim() });
      }
    }
    // Guard against silently losing the render sites (extraction drift).
    expect(imageSites.length).toBeGreaterThanOrEqual(2);
    for (const { file, line } of imageSites) {
      const ok = sanctioned.some((s) => line.includes(s));
      expect(ok, `${file}: <Image> source not a sanctioned generated asset -> ${line}`).toBe(true);
    }
  });

  it("no mobile source feeds a raw-photo / upload URI into an Image source", () => {
    // Patterns that would indicate a raw selfie/upload being rendered back.
    const forbidden = /source=\{\{[^}]*(\b(photo|selfie|upload|referencePhoto|rawPhoto|photoUri)\w*|asset\.uri)/i;
    for (const file of files) {
      const src = read(file);
      expect(forbidden.test(src), `${file} appears to render a raw photo in an Image source`).toBe(false);
    }
  });
});
