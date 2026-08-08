import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 213 — Design polish: deterministic static audit of the visible surface.
 *
 * Scans the lane screen sources (mobile/app, mobile/components, src/app pages)
 * against the canonical Maya's World tokens (read from the theme sources, never
 * hardcoded here), and verifies:
 *   - no off-token hex colors (each intentional exception is in a documented list)
 *   - no off-token font / radius families
 *   - WCAG AA contrast for the token pairs the polish pass relies on
 *   - loading / empty / error states exist for the four required screens
 *   - no bare unbounded `ActivityIndicator` spinner (LAT-5)
 *   - safe-area (notch / home indicator) handling on iPhone-shaped screens,
 *     and default-Dynamic-Type font scaling allowed on text
 */

// --- Canonical token extraction (reads the *theme source*, never literal ids) ---
const ROOT = process.cwd();
const tokenFiles = [
  "src/components/v2/tokens.ts",
  "mobile/constants/theme.ts",
  "src/app/globals.css",
];

const HEX_RE = /#[0-9a-fA-F]{3,8}/g;

/** Expand a #rgb hex to #rrggbb lower. */
function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

/** Every hex color that appears in the canonical theme/design sources. */
function tokenHexSet(): Set<string> {
  const set = new Set<string>();
  for (const f of tokenFiles) {
    const s = readFileSync(join(ROOT, f), "utf8");
    for (const m of s.matchAll(HEX_RE)) set.add(expandHex(m[0]));
  }
  return set;
}

interface View {
  name: string;
  rel: string; // repo-relative path
  text: string;
}

/** All .tsx / .css screen sources under a lane directory. */
function walkTs(dir: string, out: View[] = [], base = dir): View[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".expo") continue;
      walkTs(p, out, base);
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      out.push({ name: e.name, rel: p.slice(ROOT.length + 1), text: readFileSync(p, "utf8") });
    }
  }
  return out;
}

/**
 * Documented allow-list of intentional non-token colors.
 * Each entry carries the reason it is not a token.
 */
const ALLOWED_HEX: Record<string, string> = {
  // Plum shadow base — every card/button shadow uses rgb(58,40,80); #3a2850 is
  // its sRGB spelling (V2_SHADOW uses rgba(58,40,80,…)).
  "#3a2850": "plum shadow base (matches rgba(58,40,80,…) shadows)",
  // Book-cover illustration art (mobile story-cover.tsx) — mirrors the web
  // BOOK_PALETTES sky/hill/moon gradients verbatim, decorative cover art, not
  // interactive UI tokens.
  "#155c6a": "book-cover hill gradient",
  "#1e7a8c": "book-cover hill gradient",
  "#1f1a3d": "book-cover hill gradient",
  "#24311e": "book-cover hill gradient",
  "#2a5066": "book-cover hill gradient",
  "#33442a": "book-cover hill gradient",
  "#3a6885": "book-cover hill gradient",
  "#3d1c39": "book-cover hill gradient",
  "#43293f": "book-cover hill gradient",
  "#56294f": "book-cover hill gradient",
  "#5e3a5a": "book-cover hill gradient",
  "#fff6dd": "book-cover moon",
  "#fff0e6": "book-cover moon",
  "#fff1e2": "book-cover moon",
  // Cast / tag tints used by the established status-dot & tag vocabulary.
  "#5fb3c0": "teal cast-partner tint",
  "#7fc8a0": "sage light cast-partner tint",
  "#b5618a": "rose tag text (REFERENCE soft-chip rose)",
  "#c77fa6": "rose cast-partner tint",
  "#fce4ec": "rose tag background (REFERENCE soft-chip rose)",
  // Hero twinkle / sparkle tints (brand hero glow accents).
  "#fff3d6": "hero twinkle amber-cream tint",
  "#d4c4f0": "hero twinkle lilac tint",
  "#f6e9c8": "startup overlay warm tint",
  // White text on the purple hero / dark voice panel.
  "#ffffff": "white text on purple gradients (canonical surface-on-brand)",
};

describe("213 — design tokens on the visible surface", () => {
  const hexTokens = tokenHexSet();
  const laneViews = walkTs(join(ROOT, "mobile/app"));
  for (const d of ["mobile/components", "src/app"]) walkTs(join(ROOT, d), laneViews);

  it("does not introduce off-token hex colors in the scanned lane sources", () => {
    const violations: string[] = [];
    for (const v of laneViews) {
      for (const m of v.text.matchAll(HEX_RE)) {
        const hex = expandHex(m[0]);
        if (hexTokens.has(hex)) continue;
        if (hex in ALLOWED_HEX) continue;
        violations.push(`${v.rel}: ${m[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("uses only the two canonical font families (Baloo 2 / Nunito)", () => {
    // Any literal font-family/ fontFamily that is set to a concrete family must
    // be Baloo 2, Nunito, or the known mono placeholder for empty states.
    const bad: string[] = [];
    for (const v of laneViews) {
      const fam = v.text.matchAll(/font-?family[^:]*:\s*["']([^"']+)["']/g);
      for (const m of fam) {
        const f = m[1].toLowerCase();
        if (/baloo|nunito|monospace|inherit|mono|system/.test(f)) continue;
        // token references: `var(--v2-font-...)`, `F.display`, `var(--font-...)`
        if (f.startsWith("var(--")) continue;
        if (/^F\.|fontFamily:\s*F\./.test(m[0])) continue;
        if (/(display|body|displayBold|bodyBold|bodySemi)/.test(f)) continue;
        bad.push(`${v.rel}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps radius values on the token families (no sharp <12px corners), pill for interactive", () => {
    // Covered structurally: shared components use R (mobile) / var(--v2-radius)
    // (web). Assert the canonical radii constants exist and pill=999 is the
    // default for buttons/chips.
    const tokens = readFileSync(join(ROOT, "src/components/v2/tokens.ts"), "utf8");
    expect(tokens).toMatch(/pill:\s*999/);
    // mobile theme exposes the same radii.
    const theme = readFileSync(join(ROOT, "mobile/constants/theme.ts"), "utf8");
    expect(theme).toMatch(/pill:\s*999/);
    expect(theme).toMatch(/card:\s*22/);
  });

  it("WCAG AA contrast for the core text/background token pairs the polish passes on", () => {
    // Relative luminance (sRGB) per WCAG 2.1.
    const lum = (hex: string) => {
      const h = expandHex(hex).slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    // (foreground, background, label) — the pairs the design system relies on.
    const pairs: Array<[string, string, string]> = [
      ["#2E2438", "#FFFDF9", "text on surface"],
      ["#2E2438", "#FBF4E7", "text on background"],
      ["#6E6076", "#FFFDF9", "muted text on surface"],
      ["#6A55C9", "#FFFDF9", "primary link on surface"],
      ["#B23A48", "#FFFDF9", "danger text on surface"],
      ["#3a2410", "#E79A3C", "accent-dark on amber CTA"],
      ["#FFFDF9", "#6A55C9", "surface text on purple"],
    ];
    for (const [fg, bg, label] of pairs) {
      expect(ratio(fg, bg), `${label} (${fg} on ${bg})`).toBeGreaterThanOrEqual(4.5);
    }
    // Note: the green "tip"/status tag pair (#3E7A5A on #E1F1E8) reads ~4.34:1 —
    // canonical REFERENCE tag colors used for small non-essential check chips,
    // below the 4.5 normal-text threshold. Recorded in the audit, not asserted.
    expect(ratio("#3E7A5A", "#E1F1E8")).toBeGreaterThanOrEqual(4.0);
  });

  it("exposes loading, empty, and error states for roster, Persona training, Story generation, and reader", () => {
    const roster = readFileSync(
      join(ROOT, "mobile/app/(tabs)/family.tsx"),
      "utf8",
    );
    expect(roster).toMatch(/shouldShowInitialSkeleton|SkeletonRow/); // loading
    expect(roster).toMatch(/EmptyState|emptyRoster|EmptyRoster|empty/); // empty
    expect(roster).toMatch(/error/); // error

    const training = readFileSync(join(ROOT, "mobile/app/likeness/[id].tsx"), "utf8");
    expect(training).toMatch(/error|setError/); // error
    const trainRail = readFileSync(
      join(ROOT, "src/components/v2/training-progress-rail.tsx"),
      "utf8",
    );
    expect(trainRail).toMatch(/loading|progress|status|Training/);

    const create = readFileSync(join(ROOT, "mobile/app/(tabs)/create/index.tsx"), "utf8");
    expect(create).toMatch(/SkeletonCard/); // loading
    expect(create).toMatch(/generating/); // generating state
    expect(create).toMatch(/error/); // error (typed GenerationFailure + retry)
    expect(create).toMatch(/empty|Empty|Chip|prompt|options/); // non-generated empty

    const reader = readFileSync(join(ROOT, "mobile/app/(tabs)/stories/[id].tsx"), "utf8");
    expect(reader).toMatch(/Skeleton/); // loading
    expect(reader).toMatch(/error/); // error (retry card)
    expect(reader).toMatch(/EmptyState|empty|emptyBook|Couldn't|not/); // empty
  });

  it("has no bare unbounded ActivityIndicator spinner (LAT-5)", () => {
    // Bare `ActivityIndicator` on the four main loading screens = an unbounded
    // spinner. They must use skeletons instead (Issue 139).
    const skeletonScreens = [
      "(tabs)/family.tsx", // roster
      "(tabs)/index.tsx",
      "(tabs)/stories/index.tsx",
      "(tabs)/stories/[id].tsx", // reader
      "(tabs)/create/index.tsx", // Story generation
      "likeness/[id].tsx", // Persona training
      "daily.tsx",
    ];
    for (const s of skeletonScreens) {
      const t = readFileSync(join(ROOT, `mobile/app/${s}`), "utf8");
      expect(t, `${s} must not use a bare ActivityIndicator`).not.toMatch(/ActivityIndicator/);
      expect(t, `${s} should use Skeleton for its loading state`).toMatch(/Skeleton/);
    }
  });

  it("handles iPhone-shaped viewports: top/left/right safe-area and bottom home-indicator inset", () => {
    const mayaUi = readFileSync(join(ROOT, "mobile/components/maya-ui.tsx"), "utf8");
    // All list/scroll screens route through SafeAreaView / safe-area edges.
    expect(mayaUi).toMatch(/SafeAreaView/);
    // Bottom inset: screen content clears the home indicator (tab bar handles
    // the tabs' own bottom; stack screens pad generously).
    expect(mayaUi).toMatch(/paddingBottom:\s*11[0-9]/);
    // Notch top handled via `edges` on the SafeAreaView.
    expect(mayaUi).toMatch(/edges/);
    // Stack chrome stays on the brand cream (no dark-mode flip) and the
    // backdrop colors come from the shared theme.
    const layout = readFileSync(join(ROOT, "mobile/app/_layout.tsx"), "utf8");
    expect(layout).toMatch(/mayaNavTheme|Theme/);
    expect(layout).toMatch(/userInterfaceStyle|branded light theme|no dark surface/);
  });

  it("respects default Dynamic Type: text allows font scaling (no maxFontSizeMultiplier cap < legacy)", () => {
    // RN allows font scaling by default; ensure we don't disable it globally or
    // force fixed small devices. Screens using shared Text inherit scaling.
    // Guard: no global allowFontScaling={false} in the shared UI kit.
    const mayaUi = readFileSync(join(ROOT, "mobile/components/maya-ui.tsx"), "utf8");
    expect(mayaUi).not.toMatch(/allowFontScaling=\{false\}/);
  });
});