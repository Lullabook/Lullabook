/** Shared v2 "Maya's World" design tokens — from Lullabook Redesign v2.dc.html */
export const V2_COLORS = {
  background: "#FBF4E7",
  surface: "#FFFDF9",
  surfaceAlt: "#FFF8EC",
  border: "#ECE1CE",
  borderSoft: "#F0E6D2",
  borderDashed: "#D8C9B0",
  text: "#2E2438",
  textMuted: "#6E6076",
  textSoft: "#9A8A78",
  textDate: "#A99FB0",
  primary: "#6A55C9",
  primaryLight: "#8B6DF0",
  primaryBg: "#EDE7FE",
  primarySelectedText: "#4A3D6B",
  accent: "#E79A3C",
  accentLight: "#F6C177",
  accentDarkText: "#3a2410",
  badgeGold: "#FBEBCE",
  badgeGoldText: "#9A6B1E",
  heroGradient: "linear-gradient(135deg,#6A55C9 0%,#B5739E 48%,#F0A878 100%)",
  heroText: "#FBEAF3",
  heroLabel: "#FFE9C9",
  // Cast / palette accents
  rose: "#E78AA0",
  roseLight: "#F2A6B8",
  sage: "#5FB389",
  sageLight: "#9FD8B1",
  teal: "#3f9bb0",
  tealLight: "#7fc8c0",
  hoverTint: "#F6F1FF",
  // Voice panel
  nightPanel: "#2A2452",
  nightPanelMid: "#3E2F63",
  voiceMuted: "#C9BDE8",
  voiceQuote: "#D7CBEE",
  voiceDuration: "#9F92C4",
  voiceCream: "#FAF4E6",
  waveformBar: "rgba(185,165,245,0.75)",
  // Status dots
  statusReadyDot: "#5FB389",
  statusTrainingDot: "#E79A3C",
  statusNeedsPhotosDot: "#C9A9A9",
  // Photo slots
  photoPlaceholderText: "#B7A992",
  // Try-chip green
  chipGreenBg: "#E1F1E8",
  chipGreenText: "#3E7A5A",
  danger: "#B23A48",
} as const;

/** Border radii (px) — visual spec §1E. */
export const V2_RADIUS = {
  pill: 999,
  hero: 30,
  banner: 28,
  book: 18,
  card: 22,
  detail: 26,
  row: 18,
  slot: 12,
  audio: 14,
  voicePanel: 20,
  nicknameBox: 16,
  charAvatar: 20,
  storyTypeCard: 16,
  generateBtn: 14,
  brandIcon: 13,
} as const;

/** Box shadows — visual spec §1F. */
export const V2_SHADOW = {
  nav: "0 4px 14px rgba(58,40,80,0.05)",
  brandIcon: "0 6px 16px rgba(106,85,201,0.35)",
  hero: "0 24px 56px rgba(106,85,201,0.32)",
  banner: "0 22px 50px rgba(106,85,201,0.3)",
  book: "0 12px 28px rgba(58,40,80,0.16)",
  bookHover: "0 22px 44px rgba(58,40,80,0.26)",
  familyDetail: "0 12px 32px rgba(58,40,80,0.08)",
  familyRow: "0 4px 12px rgba(58,40,80,0.04)",
  familyRowActive: "0 6px 18px rgba(139,109,240,0.14)",
  charCard: "0 8px 22px rgba(58,40,80,0.07)",
  composerCard: "0 8px 24px rgba(58,40,80,0.06)",
  briefRail: "0 18px 44px rgba(106,85,201,0.28)",
  reader: "0 24px 56px rgba(58,40,80,0.14)",
  heroStar: "0 14px 34px rgba(0,0,0,0.22)",
  dashedPlus: "0 6px 16px rgba(58,40,80,0.1)",
} as const;

/** Gradients — visual spec §1B. */
export const V2_GRADIENT = {
  hero: "linear-gradient(135deg,#6A55C9 0%,#B5739E 48%,#F0A878 100%)",
  banner: "linear-gradient(135deg,#6A55C9 0%,#B5739E 52%,#F0A878 100%)",
  briefRail: "linear-gradient(160deg,#6A55C9,#B5739E)",
  voicePanel: "linear-gradient(160deg,#2A2452,#3E2F63)",
  ctaAmber: "linear-gradient(135deg,#F6C177,#E79A3C)",
  ctaPurple: "linear-gradient(135deg,#8B6DF0,#6A55C9)",
  progressFill: "linear-gradient(90deg,#FFFDF9,#F6C177)",
  coverShade: "linear-gradient(to top,rgba(20,14,40,0.78),transparent)",
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
  { href: "/daily", icon: "📔", label: "Daily" },
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
