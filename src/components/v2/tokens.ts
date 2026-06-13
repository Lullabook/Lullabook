/** Shared v2 "Maya's World" design tokens — from Lullabook Redesign v2.dc.html */
export const V2_COLORS = {
  background: "#FBF4E7",
  surface: "#FFFDF9",
  surfaceAlt: "#FFF8EC",
  border: "#ECE1CE",
  borderSoft: "#F0E6D2",
  text: "#2E2438",
  textMuted: "#6E6076",
  textSoft: "#9A8A78",
  primary: "#6A55C9",
  primaryLight: "#8B6DF0",
  primaryBg: "#EDE7FE",
  accent: "#E79A3C",
  accentLight: "#F6C177",
  badgeGold: "#FBEBCE",
  badgeGoldText: "#9A6B1E",
  heroGradient: "linear-gradient(135deg,#6A55C9 0%,#B5739E 48%,#F0A878 100%)",
  heroText: "#FBEAF3",
  heroLabel: "#FFE9C9",
} as const;

export const V2_FONTS = {
  display: "'Baloo 2', cursive",
  body: "'Nunito', sans-serif",
} as const;

export const V2_NAV = [
  { href: "/world", icon: "☀️", label: "World" },
  { href: "/stories", icon: "📚", label: "Stories" },
  { href: "/storybooks/new", icon: "✨", label: "Create" },
  { href: "/family", icon: "💛", label: "Family" },
  { href: "/characters", icon: "🐻", label: "Characters" },
] as const;

export const AVATAR_GRADIENTS = [
  "linear-gradient(150deg,#8B6DF0,#6A55C9)",
  "linear-gradient(150deg,#E79A3C,#F6C177)",
  "linear-gradient(150deg,#E78AA0,#F2A6B8)",
  "linear-gradient(150deg,#5FB389,#9FD8B1)",
  "linear-gradient(150deg,#3f9bb0,#7fc8c0)",
];

export function bookSky(index: number): string {
  const skies = [
    "linear-gradient(160deg,#4a7f5a,#e8c46a)",
    "linear-gradient(160deg,#5b8fb0,#cfe6f0)",
    "linear-gradient(160deg,#2f9bb0,#f6d9a0)",
    "linear-gradient(160deg,#7a3f6e,#f2a6b8)",
    "linear-gradient(160deg,#3b2f6e,#6a55c9)",
    "linear-gradient(160deg,#8a5a86,#f6b98c)",
  ];
  return skies[index % skies.length]!;
}

export function statusBadge(status: string): { label: string; className: string } {
  if (status === "finalized") return { label: "Finalized", className: "v2-badge-finalized" };
  if (status === "draft") return { label: "Draft", className: "v2-badge-draft" };
  return { label: "Generating", className: "v2-badge-generating" };
}
