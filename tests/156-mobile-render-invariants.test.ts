import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 156 — Mobile render-layer invariant guards (part3 audit, R1 polish).
 * Hardened per handoff follow-ups #5/#6 (2026-07-05 part3 pass):
 *
 *   D1. Reader page-turn < 100ms (latency budget). The fix replaced
 *       `SlideInRight.duration(280).springify()` — springify IGNORES
 *       `.duration()` and settles ~400ms — with a 90ms timing slide. Guarded
 *       both at the `PageTurn` body AND with a whole-file chain scan, so
 *       factoring the entering config out to a module-level const cannot move
 *       a `.springify()` outside the checked slice.
 *   D2. Raw child photos are write-only, never rendered (security boundary).
 *       A person's likeness may render ONLY via generated assets
 *       (`avatarUrl` / `illustrationSource`). Guarded by resolving each
 *       `<Image>` source expression to its DEFINITION/WRITE sites — no
 *       name-based allowlisting (a variable merely named `source` fed a raw
 *       upload URI must fail).
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

/**
 * From `src[idx]` (the start of a builder identifier), consume the full
 * method chain that follows: any run of `.method(...)` links with balanced
 * parentheses (whitespace/newlines allowed between links). Returns the whole
 * chain text, e.g. `SlideInRight.duration(90).easing(Easing.out(Easing.quad))`.
 */
function chainAt(src: string, idx: number): string {
  let i = idx;
  while (i < src.length && /[\w$]/.test(src[i])) i++; // the builder name
  for (;;) {
    let j = i;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== ".") break;
    j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    while (j < src.length && /[\w$]/.test(src[j])) j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== "(") break;
    let depth = 0;
    do {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") depth--;
      j++;
    } while (j < src.length && depth > 0);
    i = j;
  }
  return src.slice(idx, i);
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

  it("whole-file: no SlideIn*/FadeIn chain anywhere carries .springify(); SlideIn* durations stay <= 100 (survives factoring the config out of PageTurn)", () => {
    // PageTurn's transition builders: any SlideIn* variant, and the bare
    // `FadeIn` its reduce-motion branch uses. `\bFadeIn\b` deliberately does
    // NOT match `FadeInUp` — that is the Card entrance, not a page turn, and
    // it may spring. If the entering config is ever refactored to a
    // module-level const, its chain still starts at one of these builders and
    // is still caught here. The 100ms duration cap applies to SlideIn* only:
    // the page-turn slide is the budgeted transition, while bare FadeIn is
    // also the Card reduce-motion crossfade (120ms, legitimately > 100).
    // PageTurn-body durations are already capped by the test above.
    const builders = /\b(SlideIn\w*|FadeIn)\b/g;
    for (const m of src.matchAll(builders)) {
      const chain = chainAt(src, m.index!);
      expect(
        chain.includes(".springify("),
        `maya-ui.tsx: page-transition builder chain uses .springify() (ignores .duration(), settles ~400ms) -> ${chain}`
      ).toBe(false);
      if (!m[1].startsWith("SlideIn")) continue;
      for (const d of [...chain.matchAll(/\.duration\((\d+)\)/g)].map((x) => Number(x[1]))) {
        expect(d, `maya-ui.tsx: page-turn slide duration ${d}ms blows the 100ms budget -> ${chain}`).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("156 — D2: no mobile <Image> renders a raw uploaded photo", () => {
  const files = [...tsxFiles(mobile("app")), ...tsxFiles(mobile("components"))];

  // Sanctioned likeness-render helpers (generated assets, never the raw upload).
  const SANCTIONED = ["avatarUrl(", "illustrationSource("];
  const derivesFromSanctioned = (text: string) => SANCTIONED.some((s) => text.includes(s));

  /** Extract the balanced `{...}` source expression of each <Image> in a file. */
  function imageSourceExprs(src: string): string[] {
    const exprs: string[] = [];
    for (const m of src.matchAll(/<Image\b/g)) {
      const at = src.indexOf("source=", m.index!);
      if (at === -1) continue;
      let i = at + "source=".length;
      expect(src[i], "Image source must be a {expr}").toBe("{");
      let depth = 0;
      const start = i + 1;
      do {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      } while (i < src.length && depth > 0);
      exprs.push(src.slice(start, i - 1));
    }
    return exprs;
  }

  /**
   * Every statement that writes `ident` in this file. Covers direct
   * assignment (`const ident = …`) and the useState pattern (the declaration
   * plus every line that touches the setter — including passing it as a
   * callback, e.g. `.then(setSource)`).
   */
  function writeSites(src: string, ident: string): string[] {
    const lines = src.split("\n");
    const writes: string[] = [];
    // Direct assignments: declaration (`const ident =`) or a statement-level
    // reassignment (`ident = …`) — NOT the JSX attribute `source={ident}`.
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=`);
    const reassign = new RegExp(`^\\s*${ident}\\s*=[^=]`);
    for (const line of lines) {
      if (decl.test(line) || reassign.test(line)) writes.push(line.trim());
    }
    // useState: const [ident, setIdent] = useState(initial)
    // `.*` runs to end-of-line (not `[^;]*` — a `;` can sit inside the type
    // annotation) so the initial value, e.g. `(null)`, stays in the capture.
    const stateDecl = src.match(new RegExp(`const\\s*\\[\\s*${ident}\\s*,\\s*(\\w+)\\s*\\]\\s*=\\s*useState.*`));
    if (stateDecl) {
      writes.push(stateDecl[0]);
      const setter = stateDecl[1];
      for (const line of lines) {
        if (line.includes(setter) && !line.includes("useState")) writes.push(line.trim());
      }
    }
    return writes;
  }

  it("every <Image> source resolves, at its definition/write sites, to a generated avatar/illustration helper", () => {
    let sites = 0;
    for (const file of files) {
      const src = read(file);
      for (const expr of imageSourceExprs(src)) {
        sites++;
        // Inline derivation, e.g. {{ uri: avatarUrl(avatarKey) }}.
        if (derivesFromSanctioned(expr)) continue;
        // Identifier-fed source: NO name-based sanctioning. Resolve the
        // identifier's writes in this file and require every non-null write
        // to derive from a sanctioned generated helper.
        const ident = expr.trim().match(/^([\w$]+)$/)?.[1];
        expect(
          ident,
          `${file}: <Image> source is neither an inline generated-asset derivation nor a resolvable identifier -> ${expr.trim()}`
        ).toBeTruthy();
        const writes = writeSites(src, ident!);
        expect(
          writes.length,
          `${file}: <Image> source \`${ident}\` has no visible definition in this file — derive it from avatarUrl()/illustrationSource() where it is defined`
        ).toBeGreaterThan(0);
        for (const w of writes) {
          const ok =
            derivesFromSanctioned(w) ||
            /\bnull\b/.test(w) || // clearing state / null initial
            /useState[^(]*\(\s*null\s*\)/.test(w);
          expect(
            ok,
            `${file}: write site for <Image> source \`${ident}\` does not derive from a generated asset helper -> ${w}`
          ).toBe(true);
        }
      }
    }
    // Guard against silently losing the render sites (extraction drift).
    expect(sites).toBeGreaterThanOrEqual(2);
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
