import type { Brief } from "@/domain/types";

/**
 * Deterministic local placeholder art (PRD v22 decision 3 / FAIL-3).
 *
 * A Character-only Brief (no Persona = no trained likeness) must produce a
 * readable 12-Page `draft` with generic art and ZERO fal image calls. This
 * module renders that art in-process: a pure function of (storybookId,
 * pageIndex), so the same book always gets the same bytes — no raw photo, no
 * LoRA key, no provider URL, and no likeness data can enter the output (the
 * renderer never receives names, ids, or prompts, only the two seed values).
 */

const PALETTES: readonly (readonly [string, string, string])[] = [
  ["#F9E8D2", "#8B5E83", "#E8A75D"], // cream / dusk purple / golden amber
  ["#EAF2E8", "#5B7B6E", "#F2C14E"], // sage / forest / honey
  ["#E8EEF9", "#5B6D9E", "#F2A65A"], // pale blue / indigo / apricot
  ["#F8EBE3", "#9C6644", "#7FB3B5"], // blush / cocoa / teal
  ["#F1E8F7", "#7A5C93", "#E9B44C"], // lilac / plum / marigold
];

/** FNV-1a over a seed string → 32-bit unsigned int. */
function hash(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0..1 value for a (seed, salt) pair — no Math.random. */
function derive(seed: number, salt: number): number {
  return (hash(`${seed}:${salt}`) % 1000) / 1000;
}

/**
 * The placeholder-art decision: a Brief without any Persona has no trained
 * likeness to condition illustrations on, so its Pages use deterministic local
 * art instead of a paid image call. A Brief that lists a Persona (ready or
 * not) never takes this path — an unconfirmed Persona is rejected by the
 * likeness gate, never silently downgraded here.
 */
export function shouldUsePlaceholderArt(brief: Pick<Brief, "starringPersonaIds">): boolean {
  return brief.starringPersonaIds.length === 0;
}

/**
 * Render one Page's placeholder art as SVG bytes. Pure and deterministic:
 * identical inputs → identical bytes. The artwork is geometric only (soft
 * background, moon/star motif, page badge) — nothing user- or likeness-derived
 * is embedded.
 */
export function renderPlaceholderArtSvg(input: { storybookId: string; pageIndex: number }): Buffer {
  const { storybookId, pageIndex } = input;
  const seed = hash(`${storybookId}:${pageIndex}`);
  const [bg, accent, accent2] = PALETTES[seed % PALETTES.length]!;

  const moonX = 280 + derive(seed, 1) * 420;
  const moonY = 240 + derive(seed, 2) * 260;
  const moonR = 90 + derive(seed, 3) * 70;
  const starX = 170 + derive(seed, 4) * 660;
  const starY = 130 + derive(seed, 5) * 180;
  const starR = 26 + derive(seed, 6) * 34;
  const blobX = 210 + derive(seed, 7) * 600;
  const blobY = 560 + derive(seed, 8) * 220;
  const blobR = 120 + derive(seed, 9) * 140;
  const hillW = 300 + derive(seed, 10) * 420;
  const hillX = derive(seed, 11) * 400 - 100;

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Placeholder storybook illustration">',
    `<rect width="1024" height="1024" fill="${bg}"/>`,
    `<circle cx="${moonX.toFixed(1)}" cy="${moonY.toFixed(1)}" r="${moonR.toFixed(1)}" fill="${accent2}" opacity="0.9"/>`,
    `<circle cx="${(moonX - moonR * 0.28).toFixed(1)}" cy="${(moonY - moonR * 0.3).toFixed(1)}" r="${(moonR * 0.16).toFixed(1)}" fill="${bg}" opacity="0.8"/>`,
    `<circle cx="${(moonX + moonR * 0.3).toFixed(1)}" cy="${(moonY + moonR * 0.24).toFixed(1)}" r="${(moonR * 0.12).toFixed(1)}" fill="${bg}" opacity="0.8"/>`,
    `<circle cx="${(moonX - moonR * 0.12).toFixed(1)}" cy="${(moonY + moonR * 0.34).toFixed(1)}" r="${(moonR * 0.1).toFixed(1)}" fill="${bg}" opacity="0.8"/>`,
    `<circle cx="${starX.toFixed(1)}" cy="${starY.toFixed(1)}" r="${starR.toFixed(1)}" fill="${accent}" opacity="0.7"/>`,
    `<circle cx="${blobX.toFixed(1)}" cy="${blobY.toFixed(1)}" r="${blobR.toFixed(1)}" fill="${accent}" opacity="0.35"/>`,
    `<circle cx="${(blobX + 240 + derive(seed, 12) * 160).toFixed(1)}" cy="${(blobY - 90).toFixed(1)}" r="${(blobR * 0.6).toFixed(1)}" fill="${accent2}" opacity="0.3"/>`,
    `<ellipse cx="512" cy="${(blobY + blobR + 60).toFixed(1)}" rx="${hillW.toFixed(1)}" ry="170" fill="${accent}" opacity="0.25"/>`,
    `<ellipse cx="${(hillX + hillW).toFixed(1)}" cy="${(blobY + blobR + 110).toFixed(1)}" rx="${(hillW * 0.7).toFixed(1)}" ry="120" fill="${accent2}" opacity="0.25"/>`,
    `<rect x="332" y="866" width="360" height="86" rx="43" fill="#FFFFFF" opacity="0.85"/>`,
    `<text x="512" y="926" font-size="40" text-anchor="middle" fill="#4A3B52" font-family="sans-serif">Page ${pageIndex + 1}</text>`,
    "</svg>",
  ].join("");

  return Buffer.from(svg, "utf8");
}
