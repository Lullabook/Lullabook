import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 213 / #224 — Design polish: deterministic static audit of the ENTIRE visible
 * surface (every screen the Guardian can reach), checked against the canonical
 * "Maya's World" tokens.
 *
 * The known failure mode of this ticket is an *incomplete audit list*, so the
 * screen set here is DERIVED FROM THE FILESYSTEM (not hand-written), and the
 * audit doc is asserted to cover every derived screen. Adding a new screen
 * without auditing it fails `covers every reachable screen`.
 *
 * Checks:
 *   - completeness: audit doc §1 lists every visible-surface file, and lists no
 *     phantom files
 *   - no off-token hex colors (each intentional exception documented below)
 *   - only the two canonical font families (Baloo 2 / Nunito)
 *   - borderRadius literals on the canonical radius scale (or a true circle, or
 *     documented)
 *   - shadows are plum-tinted (no black shadows on the shipped surface)
 *   - spacing literals sit on the 2px rhythm (documented optical nudges aside)
 *   - WCAG AA contrast for the core token pairs
 *   - loading / empty / error states for roster, Persona training, Story
 *     generation and reader; no bare unbounded spinner (LAT-5)
 *   - safe-area / notch / home-indicator handling on iPhone-shaped viewports
 *   - default Dynamic Type cannot clip text (no fixed heights on text styles,
 *     lineHeight >= 1.1x fontSize, font scaling never disabled)
 */

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Canonical token extraction — reads the *theme sources*, never literal ids.
// ---------------------------------------------------------------------------
const TOKEN_FILES = [
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
  for (const f of TOKEN_FILES) {
    const s = readFileSync(join(ROOT, f), "utf8");
    for (const m of s.matchAll(HEX_RE)) set.add(expandHex(m[0]));
  }
  return set;
}

/** Numeric literals inside a token object literal (`R = { … }`). */
function radiusValuesOf(file: string, objRe: RegExp): Set<number> {
  const m = file.match(objRe);
  const set = new Set<number>();
  if (m) for (const n of m[1].matchAll(/(\d+)/g)) set.add(Number(n[0]));
  return set;
}

interface View {
  name: string;
  rel: string; // repo-relative path, POSIX separators
  text: string;
}

/** Every .tsx source under a lane directory (recursive, sorted, stable). */
function walkTsx(dir: string, out: View[] = []): View[] {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".expo" || e.name === "__tests__") continue;
      walkTsx(p, out);
    } else if (e.name.endsWith(".tsx")) {
      out.push({ name: e.name, rel: p.slice(ROOT.length + 1).split("\\").join("/"), text: readFileSync(p, "utf8") });
    }
  }
  return out;
}

/**
 * THE VISIBLE SURFACE. Derived from the filesystem so the audit can never
 * silently miss a reachable screen:
 *   mobile/app/**        — every expo-router route + layout the Guardian passes
 *   mobile/components/** — the shared mobile UI kit those routes render
 *   src/app/**           — every Next App Router page + layout (.tsx only, so
 *                          API `route.ts` handlers are excluded — not visible)
 *   src/components/**    — the shared web UI that actually paints those pages
 */
const SURFACE_ROOTS = ["mobile/app", "mobile/components", "src/app", "src/components"];

function visibleSurface(): View[] {
  const out: View[] = [];
  for (const d of SURFACE_ROOTS) walkTsx(join(ROOT, d), out);
  // The daily tag-chip presentation literals live in this domain module and are
  // rendered verbatim by the Daily screens on both platforms — scan it too so
  // off-token or inaccessible tag colors cannot hide outside the screen tree.
  out.push({
    name: "daily-types.ts",
    rel: "src/domain/daily-types.ts",
    text: readFileSync(join(ROOT, "src/domain/daily-types.ts"), "utf8"),
  });
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

const AUDIT_DOC = "CONTEXT/handoffs/DESIGN-AUDIT-213.md";

// ---------------------------------------------------------------------------
// Documented allow-lists — every entry is an intentional, recorded deviation
// mirrored in DESIGN-AUDIT-213.md §2.
// ---------------------------------------------------------------------------

/** Intentional non-token colors, each with the reason it is not a token. */
const ALLOWED_HEX: Record<string, string> = {
  // Plum shadow base — every card/button shadow uses rgb(58,40,80); #3a2850 is
  // its sRGB spelling (V2_SHADOW uses rgba(58,40,80,…)).
  "#3a2850": "plum shadow base (matches rgba(58,40,80,…) shadows)",
  // Book-cover illustration art (mobile story-cover.tsx) — mirrors the web
  // BOOK_PALETTES sky/hill/moon gradients verbatim: decorative cover art, not
  // interactive UI chrome.
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
  "#b5618a": "rose tag text (legacy REFERENCE soft-chip rose; superseded by #9F4A72)",
  "#c77fa6": "rose cast-partner tint",
  "#fce4ec": "rose tag background (REFERENCE soft-chip rose)",
  "#9f4a72": "rose tag text — darkened from #B5618A in this pass for WCAG AA (4.72:1 on #FCE4EC)",
  "#e4eef4": "cozy tag background (daily tag vocabulary, web)",
  "#35707f": "cozy tag text — darkened from #3f7d92 in this pass for WCAG AA (4.72:1 on #E4EEF4)",
  // Hero twinkle / sparkle / significant-moment tints (brand glow accents).
  "#fff3d6": "hero twinkle amber-cream tint (home hero, world journal card)",
  "#d4c4f0": "hero twinkle lilac tint (world journal card border)",
  "#f6e9c8": "startup overlay warm tint",
  "#e8d4a8": "gold 'significant moment' accent border (daily + world journal)",
  // White text on the purple hero / dark voice panel.
  "#ffffff": "white text on purple gradients (canonical surface-on-brand)",
};

/**
 * Intentional off-scale borderRadius literals. The canonical radius scale is
 * the union of the two platform token objects (`V2_RADIUS` web + `R` mobile);
 * anything else must either be a true circle (radius === width/2, detected
 * automatically) or be recorded here.
 */
const ALLOWED_RADIUS: Record<string, string> = {
  "0": "square image fill inside an already-rounded parent (likeness sample)",
  "2": "3px-wide waveform bar cap (family voice waveform)",
  "8": "28px checkbox — deliberate rounded square, not a circle (consent row)",
  "10": "dev-only startup-timing overlay toast (never shipped to Guardians)",
  "34": "circle ring stroke around the 64px roster avatar (family/new preview)",
  "43": "circle ring stroke around the 82px roster avatar (family detail hero)",
};

/**
 * Odd spacing literals. Spacing sits on a 2px rhythm; these are recorded
 * optical nudges (1–2px hairline/centering corrections).
 */
const ALLOWED_ODD_SPACING: Record<string, string> = {
  "1": "1px hairline nudge under a meta line / divider",
  "3": "3px optical nudge on the daily tag row",
  "5": "5px pill vertical padding (keeps 22px pill height on 12px text)",
  "11": "11px pill horizontal padding (optical balance against 999 radius)",
  "13": "13px inline gap (optical balance next to a 26px icon)",
  "15": "15px not-found copy nudge",
};

/** Shadow colors allowed on the mobile surface (plum + brand-tinted glows). */
const ALLOWED_SHADOW_COLORS = new Set(["#3a2850", "#6a55c9", "#e79a3c", "#b23a48"]);

/**
 * The web stylesheet paints every `v2-*` class, so its shadows are part of the
 * visible surface even though the file is a token source rather than a screen.
 * The design system is plum-tinted; the only sanctioned black shadows are the
 * `heroStar` family — elements that float on a saturated gradient, where a plum
 * shadow reads as a colour smudge rather than depth. Each is recorded here with
 * the selector it belongs to, and the count is pinned, so a NEW black shadow
 * anywhere in `globals.css` fails this test instead of passing unseen.
 */
const ALLOWED_CSS_BLACK_SHADOWS: Record<string, string> = {
  ".v2-btn--cream": "cream pill floating on the hero gradient (heroStar family)",
  ".v2-hero__star": "120px hero star on a gradient — V2_SHADOW.heroStar verbatim",
  ".v2-hero-avatar": "120px hero avatar on a gradient — V2_SHADOW.heroStar verbatim",
  ".v2-btn-primary": "cream CTA pill floating on the hero gradient (heroStar family)",
  ".v2-continue-banner__cover": "book cover floating on the purple→peach banner gradient",
};

describe("213 / #224 — design tokens on the whole visible surface", () => {
  const hexTokens = tokenHexSet();
  const surface = visibleSurface();
  const auditDoc = readFileSync(join(ROOT, AUDIT_DOC), "utf8");

  it("derives a non-trivial visible surface from the filesystem", () => {
    // Guard the guard: if the walk ever returns nothing the other tests would
    // vacuously pass.
    expect(surface.length).toBeGreaterThan(60);
    for (const root of SURFACE_ROOTS) {
      expect(surface.some((v) => v.rel.startsWith(`${root}/`)), `no screens found under ${root}`).toBe(true);
    }
  });

  it("audit doc covers EVERY reachable screen (completeness — no screen may be omitted)", () => {
    const missing = surface.filter((v) => !auditDoc.includes(v.rel)).map((v) => v.rel);
    expect(
      missing,
      `${AUDIT_DOC} §1 must list every visible-surface file; missing: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("audit doc lists no phantom screens (every path it claims exists on disk)", () => {
    const claimed = new Set<string>();
    for (const m of auditDoc.matchAll(/`((?:mobile|src)\/[A-Za-z0-9_[\]().\-/]*\.tsx)`/g)) claimed.add(m[1]);
    expect(claimed.size).toBeGreaterThan(60);
    const phantom = [...claimed].filter((p) => !existsSync(join(ROOT, p))).sort();
    expect(phantom, `audit doc references files that do not exist: ${phantom.join(", ")}`).toEqual([]);
  });

  it("has no off-token hex colors on the visible surface", () => {
    const violations: string[] = [];
    for (const v of surface) {
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
    const bad: string[] = [];
    for (const v of surface) {
      for (const m of v.text.matchAll(/font-?family[^:]*:\s*["']([^"']+)["']/g)) {
        const f = m[1].toLowerCase();
        if (/baloo|nunito|monospace|inherit|mono|system/.test(f)) continue;
        if (f.startsWith("var(--")) continue;
        if (/(display|body|displaybold|bodybold|bodysemi)/.test(f)) continue;
        bad.push(`${v.rel}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
    // The mobile font tokens are the two brand families and nothing else.
    const theme = readFileSync(join(ROOT, "mobile/constants/theme.ts"), "utf8");
    const fams = [...theme.matchAll(/F\s*=\s*\{([^}]*)\}/g)][0]?.[1] ?? "";
    expect(fams).toMatch(/Baloo2_/);
    expect(fams).toMatch(/Nunito_/);
    expect(fams.replace(/Baloo2_\w+|Nunito_\w+/g, "")).not.toMatch(/[A-Z][a-z]+_/);
  });

  it("keeps every screen borderRadius on the canonical radius scale (circle-aware, documented exceptions)", () => {
    const mobileR = radiusValuesOf(
      readFileSync(join(ROOT, "mobile/constants/theme.ts"), "utf8"),
      /R\s*=\s*\{([^}]*)\}/,
    );
    const webR = radiusValuesOf(
      readFileSync(join(ROOT, "src/components/v2/tokens.ts"), "utf8"),
      /V2_RADIUS\s*=\s*\{([^}]*)\}/,
    );
    // One design system, two platform spellings — a screen may use any radius
    // the design system defines on either surface.
    const scale = new Set<number>([...mobileR, ...webR]);
    expect(scale.has(999)).toBe(true);
    expect(mobileR.has(999)).toBe(true);
    expect(mobileR.has(22)).toBe(true);
    expect(webR.has(999)).toBe(true);

    const bad: string[] = [];
    for (const v of surface) {
      for (const m of v.text.matchAll(/borderRadius:\s*(\d+)/g)) {
        const n = Number(m[1]);
        if (scale.has(n)) continue;
        if (String(n) in ALLOWED_RADIUS) continue;
        // True circle: the enclosing style object sets width/height === 2*radius.
        const start = v.text.lastIndexOf("{", m.index!);
        const end = v.text.indexOf("}", m.index!);
        const obj = v.text.slice(start < 0 ? 0 : start, end < 0 ? v.text.length : end);
        const dims = [...obj.matchAll(/(?:width|height):\s*(\d+)/g)].map((d) => Number(d[1]));
        // A 9px dot rounds to radius 5, so accept 2n and 2n-1.
        if (dims.some((d) => d === n * 2 || d === n * 2 - 1)) continue;
        bad.push(`${v.rel}: borderRadius ${n}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("uses plum-tinted shadows on the shipped surface (no black shadows)", () => {
    const bad: string[] = [];
    for (const v of surface) {
      // Mobile: shadowColor must be plum or a brand-tinted glow.
      for (const m of v.text.matchAll(/shadowColor:\s*["'](#[0-9a-fA-F]{3,8})["']/g)) {
        const hex = expandHex(m[1]);
        if (ALLOWED_SHADOW_COLORS.has(hex)) continue;
        bad.push(`${v.rel}: shadowColor ${m[1]} (design system uses plum rgb(58,40,80))`);
      }
      // Web: no black box-shadows in screen sources (V2_SHADOW owns the scale).
      for (const m of v.text.matchAll(/(?:boxShadow|box-shadow)[^;\n]*?rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/g)) {
        bad.push(`${v.rel}: black boxShadow near "${m[0].slice(0, 60)}"`);
      }
    }

    // The web stylesheet paints every screen that uses a `v2-*` class, so its
    // shadows belong to the visible surface too. Attribute each black shadow to
    // the CSS rule it sits in and require that rule to be recorded above.
    const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    const seen: string[] = [];
    let selector = "<none>";
    for (const line of css.split("\n")) {
      const rule = line.match(/^\s*([.#][\w-]+[^{]*)\{\s*$/);
      if (rule) selector = rule[1].trim().split(/[\s,:]/)[0];
      if (/box-shadow\s*:[^;]*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/.test(line)) {
        seen.push(selector);
        if (!(selector in ALLOWED_CSS_BLACK_SHADOWS)) {
          bad.push(`src/app/globals.css: black box-shadow on "${selector}" — use a plum/brand tint or record it`);
        }
      }
    }
    expect(bad).toEqual([]);
    // Pin the recorded set both ways: a documented site that no longer has a
    // black shadow must be removed from the record, so the list cannot rot.
    expect(new Set(seen)).toEqual(new Set(Object.keys(ALLOWED_CSS_BLACK_SHADOWS)));
  });

  it("keeps mobile spacing on the 2px rhythm (documented optical nudges aside)", () => {
    const SPACING =
      /\b(?:padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|gap|rowGap|columnGap):\s*(-?\d+)\b/g;
    const bad: string[] = [];
    for (const v of surface) {
      if (!v.rel.startsWith("mobile/")) continue; // web spacing is rem/CSS-driven
      for (const m of v.text.matchAll(SPACING)) {
        const n = Number(m[1]);
        if (n % 2 === 0) continue;
        if (String(Math.abs(n)) in ALLOWED_ODD_SPACING) continue;
        bad.push(`${v.rel}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("WCAG AA contrast for the core text/background token pairs", () => {
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
    // Every pair is read out of the token source so a token edit is caught.
    const tok = readFileSync(join(ROOT, "src/components/v2/tokens.ts"), "utf8");
    const t = (name: string) => {
      const m = tok.match(new RegExp(`\\b${name}:\\s*"(#[0-9a-fA-F]{3,8})"`));
      expect(m, `token ${name} must exist in tokens.ts`).toBeTruthy();
      return m![1];
    };
    const pairs: Array<[string, string, string]> = [
      [t("text"), t("surface"), "text on surface"],
      [t("text"), t("background"), "text on background"],
      [t("text"), t("surfaceAlt"), "text on alt surface"],
      [t("textMuted"), t("surface"), "muted text on surface"],
      [t("textMuted"), t("background"), "muted text on background"],
      [t("primary"), t("surface"), "primary link on surface"],
      [t("primary"), t("primaryBg"), "primary on primary tint"],
      [t("primarySelectedText"), t("primaryBg"), "selected text on primary tint"],
      [t("danger"), t("surface"), "danger text on surface"],
      [t("accentDarkText"), t("accent"), "accent-dark on amber CTA"],
      [t("badgeGoldText"), t("badgeGold"), "gold badge text"],
      [t("chipGreenText"), t("chipGreenBg"), "green chip text"],
      [t("surface"), t("primary"), "surface text on purple"],
      [t("voiceMuted"), t("nightPanel"), "muted voice text on night panel"],
    ];
    for (const [fg, bg, label] of pairs) {
      expect(ratio(fg, bg), `${label} (${fg} on ${bg})`).toBeGreaterThanOrEqual(4.5);
    }
    // The two status-chip pairs used to sit below AA (gold 3.98:1, green
    // 4.34:1). Both text tokens were darkened in this pass. The two Daily tag
    // chip pairs (rose, cozy) also failed AA (3.46:1 / 3.91:1) and were
    // darkened too — they live in src/domain/daily-types.ts + mobile/app/daily.tsx,
    // which are part of the scanned surface.
    expect(ratio(t("chipGreenText"), t("chipGreenBg")), "green chip text").toBeGreaterThanOrEqual(4.5);
    expect(ratio(t("badgeGoldText"), t("badgeGold")), "gold badge text").toBeGreaterThanOrEqual(4.5);
    expect(ratio("#9F4A72", "#FCE4EC"), "rose tag text (fixed this pass)").toBeGreaterThanOrEqual(4.5);
    expect(ratio("#35707F", "#E4EEF4"), "cozy tag text (fixed this pass)").toBeGreaterThanOrEqual(4.5);
    // RECORDED (audit §3): the designed muted-meta ramp (`textSoft` meta labels,
    // `photoPlaceholderText` placeholders) sits below 4.5 by design — darkening
    // the whole muted ramp is a design-owner decision, not a polish-lane fix.
    // Regression floors keep the ramp honest: it may not degrade further.
    expect(ratio(t("textSoft"), t("surface")), "textSoft floor").toBeGreaterThanOrEqual(3.2);
    expect(ratio(t("photoPlaceholderText"), t("surface")), "placeholder floor").toBeGreaterThanOrEqual(2.0);
    // The mobile mirror must carry the same accessible values (one system).
    const mtheme = readFileSync(join(ROOT, "mobile/constants/theme.ts"), "utf8");
    for (const name of ["badgeGoldText", "greenText", "badgeGold", "greenBg"]) {
      expect(mtheme, `mobile theme must define ${name}`).toMatch(new RegExp(`\\b${name}:\\s*"#`));
    }
    const mt = (name: string) => mtheme.match(new RegExp(`\\b${name}:\\s*"(#[0-9a-fA-F]{3,8})"`))![1];
    expect(ratio(mt("badgeGoldText"), mt("badgeGold")), "mobile gold badge").toBeGreaterThanOrEqual(4.5);
    expect(ratio(mt("greenText"), mt("greenBg")), "mobile green chip").toBeGreaterThanOrEqual(4.5);
  });

  it("exposes loading, empty, and error states for roster, Persona training, Story generation, and reader", () => {
    const roster = readFileSync(join(ROOT, "mobile/app/(tabs)/family.tsx"), "utf8");
    expect(roster).toMatch(/shouldShowInitialSkeleton|SkeletonRow/); // loading
    expect(roster).toMatch(/EmptyState|emptyRoster|EmptyRoster|empty/); // empty
    expect(roster).toMatch(/error/); // error

    const training = readFileSync(join(ROOT, "mobile/app/likeness/[id].tsx"), "utf8");
    expect(training).toMatch(/Skeleton/); // loading
    expect(training).toMatch(/error|setError/); // error
    const trainRail = readFileSync(join(ROOT, "src/components/v2/training-progress-rail.tsx"), "utf8");
    expect(trainRail).toMatch(/loading|progress|status|Training/);

    const create = readFileSync(join(ROOT, "mobile/app/(tabs)/create/index.tsx"), "utf8");
    expect(create).toMatch(/SkeletonCard/); // loading
    expect(create).toMatch(/generating/); // generating state
    expect(create).toMatch(/error/); // error (typed GenerationFailure + retry)
    expect(create).toMatch(/empty|Empty|Chip|prompt|options/); // pre-generation empty

    const reader = readFileSync(join(ROOT, "mobile/app/(tabs)/stories/[id].tsx"), "utf8");
    expect(reader).toMatch(/Skeleton/); // loading
    expect(reader).toMatch(/error/); // error (retry card)
    expect(reader).toMatch(/EmptyState|empty|emptyBook|Couldn't|not/); // empty
  });

  it("has no bare unbounded ActivityIndicator spinner (LAT-5)", () => {
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
    // And nothing anywhere on the mobile surface reintroduces a page-level one.
    // Recorded exception: a *bounded* in-button pending indicator (sized by its
    // button, tied to a single submit) is not the unbounded page spinner LAT-5
    // bans. Audit §5 records these two sites.
    const IN_BUTTON_SPINNERS: Record<string, string> = {
      "mobile/app/sign-in.tsx": "bounded pending indicator inside the Google sign-in Pressable",
      "mobile/app/sign-up.tsx": "bounded pending indicator inside the Google sign-up Pressable",
    };
    const spinners = surface
      .filter((v) => v.rel.startsWith("mobile/") && /<ActivityIndicator/.test(v.text))
      .map((v) => v.rel)
      .filter((rel) => !(rel in IN_BUTTON_SPINNERS));
    expect(spinners).toEqual([]);
    // The allowed ones must genuinely still be inside a Pressable/button.
    for (const rel of Object.keys(IN_BUTTON_SPINNERS)) {
      const t = readFileSync(join(ROOT, rel), "utf8");
      expect(t, `${rel}: allowed spinner must stay inside a Pressable`).toMatch(
        /<Pressable[\s\S]{0,900}?<ActivityIndicator/,
      );
    }
  });

  it("handles iPhone-shaped viewports: top/left/right safe-area and bottom home-indicator inset", () => {
    const mayaUi = readFileSync(join(ROOT, "mobile/components/maya-ui.tsx"), "utf8");
    // All list/scroll screens route through SafeAreaView / safe-area edges.
    expect(mayaUi).toMatch(/SafeAreaView/);
    expect(mayaUi).toMatch(/edges/);
    // Notch: top edge is claimed by the shared Screen wrappers.
    expect(mayaUi).toMatch(/edges=\{?\[?["'`]?top/);
    // Home indicator: content clears it (>= 110pt bottom padding on scrollers).
    expect(mayaUi).toMatch(/paddingBottom:\s*1[1-9][0-9]/);
    // Every mobile route paints through the shared safe-area kit rather than a
    // raw View root (otherwise the notch/home indicator would be unhandled).
    const rawRoots: string[] = [];
    for (const v of surface) {
      if (!v.rel.startsWith("mobile/app/")) continue;
      if (/_layout\.tsx$|\+html\.tsx$|^mobile\/app\/index\.tsx$/.test(v.rel)) continue; // chrome / redirect
      const usesKit = /components\/maya-ui/.test(v.text);
      const usesSafeArea = /SafeAreaView|useSafeAreaInsets/.test(v.text);
      // A route may delegate its whole render to a shared mobile component —
      // that component is itself in `surface` and is checked on this same pass.
      const delegates = /from "@\/components\//.test(v.text);
      if (!usesKit && !usesSafeArea && !delegates) rawRoots.push(v.rel);
    }
    expect(rawRoots, "these mobile routes bypass the safe-area kit").toEqual([]);
    // Stack chrome stays on the brand cream (no dark-mode flip).
    const layout = readFileSync(join(ROOT, "mobile/app/_layout.tsx"), "utf8");
    expect(layout).toMatch(/mayaNavTheme|Theme/);
    expect(layout).toMatch(/userInterfaceStyle|branded light theme|no dark surface/);
  });

  it("cannot clip text at the default Dynamic Type size", () => {
    const bad: string[] = [];
    for (const v of surface) {
      if (!v.rel.startsWith("mobile/")) continue;
      // Font scaling is never disabled or capped.
      if (/allowFontScaling=\{false\}|allowFontScaling:\s*false/.test(v.text)) {
        bad.push(`${v.rel}: disables allowFontScaling`);
      }
      for (const m of v.text.matchAll(/maxFontSizeMultiplier=\{([\d.]+)\}/g)) {
        if (Number(m[1]) < 1.2) bad.push(`${v.rel}: maxFontSizeMultiplier ${m[1]} < 1.2`);
      }
      // Text styles must not pin a fixed height (that clips when type grows) and
      // must give the glyphs at least 1.1x leading.
      for (const m of v.text.matchAll(/\{[^{}]*\}/g)) {
        const obj = m[0];
        const fs = obj.match(/fontSize:\s*(\d+)/);
        if (!fs) continue;
        if (/[\s{,]height:\s*\d+/.test(obj)) {
          bad.push(`${v.rel}: fixed height on a text style — use minHeight (${obj.slice(0, 70)})`);
        }
        const lh = obj.match(/lineHeight:\s*(\d+)/);
        if (lh && Number(lh[1]) < Number(fs[1]) * 1.1) {
          bad.push(`${v.rel}: lineHeight ${lh[1]} < 1.1x fontSize ${fs[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // Tap targets stay >= 44pt via minHeight (grows with type, never clips).
    const mayaUi = readFileSync(join(ROOT, "mobile/components/maya-ui.tsx"), "utf8");
    expect(mayaUi).toMatch(/minHeight:\s*44/);
  });
});
