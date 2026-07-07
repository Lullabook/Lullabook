/**
 * "Book cover" art for the Stories screens — ports the web v2 look
 * (src/components/v2/book-cover.tsx + src/lib/v2-theme.ts) into RN: gradient
 * sky, moon, two hill silhouettes, a bottom shade, a status pill, and the
 * title. New file (not one of the existing shared components) used by both
 * mobile/app/(tabs)/stories/index.tsx (shelf grid + continue banner) and
 * mobile/app/(tabs)/stories/[id].tsx (reader header) so covers look
 * identical everywhere. Deliberately lives under mobile/components/ rather
 * than mobile/app/ — anything under app/ is scanned by expo-router's
 * require.context and becomes a route (see AGENTS.md: read the v56 docs
 * before assuming routing conventions); only mobile/app/**\/_layout.tsx is
 * special-cased, not other underscore-prefixed files.
 *
 * The moon/hill/title/shade hex values are decorative cover ILLUSTRATION art
 * (mirrored 1:1 from src/lib/v2-theme.ts's BOOK_PALETTES) — the same category
 * as the BOOK_SKIES gradients this replaces in index.tsx, not interactive UI
 * tokens, so they intentionally sit outside the restricted C surface/text
 * palette. Status badge colors, on the other hand, are pulled straight from
 * the existing mobile token set (green/badgeGold/primaryBg/danger) — no new
 * colors introduced there.
 */
import { StyleSheet, Text, View } from "react-native";
import { BrandGradient } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";

const BOOK_PALETTES: { sky: [string, string]; hill: string; hill2: string; moon: string }[] = [
  { sky: ["#4a7f5a", "#e8c46a"], hill: "#33442a", hill2: "#24311e", moon: "#FFF6DD" },
  { sky: ["#5b8fb0", "#cfe6f0"], hill: "#3a6885", hill2: "#2a5066", moon: "#FFFFFF" },
  { sky: ["#2f9bb0", "#f6d9a0"], hill: "#1e7a8c", hill2: "#155c6a", moon: "#FFF3D6" },
  { sky: ["#7a3f6e", "#f2a6b8"], hill: "#56294f", hill2: "#3d1c39", moon: "#FFF0E6" },
  { sky: ["#3b2f6e", "#6a55c9"], hill: "#2a2452", hill2: "#1f1a3d", moon: "#F6C177" },
  { sky: ["#8a5a86", "#f6b98c"], hill: "#5e3a5a", hill2: "#43293f", moon: "#FFF1E2" },
];
const TITLE_CREAM = "#FAF4E6";
const SHADE_TOP = "rgba(20,14,40,0.78)";
const SHADE_BOTTOM = "rgba(20,14,40,0)";

// Same runtime-safe require pattern as maya-ui's BrandGradient — a missing
// native module degrades to a flat scrim instead of a red-screen.
let LinearGradientImpl: React.ComponentType<{
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: object;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("expo-linear-gradient");
  LinearGradientImpl = mod.LinearGradient;
} catch {
  LinearGradientImpl = null;
}

/** Mirrors src/lib/v2-theme.ts's bookCoverPalette hash exactly — the same
 * seed (storybook id) produces the same cover art on web and mobile. */
export function bookPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % BOOK_PALETTES.length;
  }
  return BOOK_PALETTES[hash]!;
}

export type CoverStatus = "finalized" | "draft" | "generating" | "failed" | (string & {});

/** Mirrors src/lib/v2-theme.ts's bookStatusLabel/bookStatusClass. */
export function statusBadge(status: CoverStatus): { label: string; bg: string; color: string } {
  if (status === "finalized") return { label: "Finalized", bg: C.greenBg, color: C.greenText };
  if (status === "draft") return { label: "Draft", bg: C.badgeGold, color: C.badgeGoldText };
  if (status === "failed") return { label: "Failed", bg: C.dangerBg, color: C.danger };
  return { label: "Generating", bg: C.primaryBg, color: C.primary };
}

function ShadeOverlay() {
  if (LinearGradientImpl) {
    return <LinearGradientImpl colors={[SHADE_TOP, SHADE_BOTTOM]} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={a.shade} />;
  }
  return <View style={[a.shade, { backgroundColor: "rgba(20,14,40,0.35)" }]} />;
}

/**
 * The illustrated book cover — port of src/components/v2/book-cover.tsx.
 * `compact` hides the title (used for small thumbnails where it can't be
 * read) but keeps the badge, sky, and cover art.
 */
export function BookCover({
  theme,
  status,
  seed,
  compact,
}: {
  theme: string;
  status: CoverStatus;
  seed: string;
  compact?: boolean;
}) {
  const p = bookPalette(seed);
  const badge = statusBadge(status);
  return (
    <BrandGradient colors={p.sky} fallback={p.sky[0]} style={a.cover}>
      <View style={[a.moon, { backgroundColor: p.moon }]} />
      <View style={[a.hill, { backgroundColor: p.hill }]} />
      <View style={[a.hill2, { backgroundColor: p.hill2 }]} />
      <ShadeOverlay />
      <View style={[a.badge, { backgroundColor: badge.bg }]}>
        <Text style={[a.badgeText, { color: badge.color }]}>{badge.label}</Text>
      </View>
      {!compact ? (
        <Text style={a.title} numberOfLines={2}>
          {theme}
        </Text>
      ) : null}
    </BrandGradient>
  );
}

const a = StyleSheet.create({
  cover: {
    width: "100%",
    aspectRatio: 4 / 5,
    borderRadius: R.card,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#3A2850",
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  moon: { position: "absolute", top: 14, right: 16, width: 30, height: 30, borderRadius: R.pill },
  hill: { position: "absolute", bottom: -24, left: -16, width: 130, height: 82, borderRadius: R.pill },
  hill2: { position: "absolute", bottom: -30, right: -20, width: 112, height: 72, borderRadius: R.pill },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
  badge: { position: "absolute", top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  badgeText: { fontFamily: F.bodyBold, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  title: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    color: TITLE_CREAM,
    fontFamily: F.display,
    fontSize: 15,
    lineHeight: 18,
  },
});
