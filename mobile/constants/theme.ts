/**
 * Maya's World design tokens for React Native (mirrors src/components/v2/tokens.ts).
 * RN can't use CSS gradients without expo-linear-gradient, so header bands use a
 * solid `primary`. Add expo-linear-gradient later if you want the 3-stop hero.
 *
 * Brand fonts (Baloo 2 + Nunito) need expo-font. Until then, weights approximate
 * the picture-book feel. To load them:
 *   import { useFonts } from "expo-font";
 *   useFonts({ "Baloo2": require("../assets/fonts/Baloo2-Bold.ttf"), ... });
 */
export const C = {
  bg: "#FBF4E7",
  surface: "#FFFDF9",
  surfaceAlt: "#FFF8EC",
  border: "#ECE1CE",
  borderSoft: "#F0E6D2",
  borderDashed: "#D8C9B0",
  text: "#2E2438",
  muted: "#6E6076",
  soft: "#9A8A78",
  faint: "#A99FB0",
  primary: "#6A55C9",
  primaryLight: "#8B6DF0",
  primaryBg: "#EDE7FE",
  hoverTint: "#F6F1FF",
  accent: "#E79A3C",
  accentLight: "#F6C177",
  accentDark: "#3a2410",
  badgeGold: "#FBEBCE",
  badgeGoldText: "#9A6B1E",
  rose: "#E78AA0",
  green: "#5FB389",
  greenBg: "#E1F1E8",
  greenText: "#3E7A5A",
  danger: "#B23A48",
  dangerBorder: "#ECCDD2",
  dangerBg: "#FDF1F3",
} as const;

export const R = { pill: 999, card: 22, detail: 26, slot: 12, input: 14, chip: 999 } as const;

export const AVATAR_COLORS = ["#8B6DF0", "#E79A3C", "#E78AA0", "#5FB389", "#3f9bb0"];
