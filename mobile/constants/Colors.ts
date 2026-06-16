// Maya's World brand tints for the few RN Navigation/Themed defaults that read these.
// Canonical tokens live in constants/theme.ts (mirrors src/components/v2/tokens.ts).
const tintColorLight = "#6A55C9";
const tintColorDark = "#8B6DF0";

export default {
  light: {
    text: "#2E2438",
    background: "#FBF4E7",
    tint: tintColorLight,
    tabIconDefault: "#9A8A78",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#FBF4E7",
    background: "#2A2452",
    tint: tintColorDark,
    tabIconDefault: "#9F92C4",
    tabIconSelected: tintColorDark,
  },
};
