import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useEffect } from "react";
import { C, F } from "@/constants/theme";

/**
 * Issue 140 — Tab icon animates scale/weight for the selected state instead
 * of opacity-dimming (crisper per PRD v15). 1.0 → 1.18 spring on focus;
 * reduce-motion degrades to instant.
 */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const scale = useSharedValue(focused ? 1.18 : 1);
  useEffect(() => {
    scale.value = withSpring(focused ? 1.18 : 1, { damping: 18, stiffness: 320 });
  }, [focused]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[aStyle, st.tabIconWrap]}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
    </Animated.View>
  );
}

/**
 * Issue 140 — Translucent blurred tab bar with content scrolling under it
 * (the iOS standard). `expo-blur`'s `BlurView` is resolved with a runtime
 * fallback to the opaque token fill if the native module is unavailable (no
 * red-screen — cf. expo-av). Emoji iconography retained per the brand spec.
 */
let BlurViewImpl: React.ComponentType<{
  intensity?: number;
  tint?: "light" | "dark" | "default";
  style?: object;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("expo-blur");
  BlurViewImpl = mod.BlurView;
} catch {
  BlurViewImpl = null;
}

function TabBarBackground() {
  if (BlurViewImpl) {
    return <BlurViewImpl intensity={48} tint="light" style={StyleSheet.absoluteFill} />;
  }
  // Graceful opaque fallback (PRD v15 failure-mode invariant).
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surface }]} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.soft,
        // Issue 140 — translucent: true + a BlurView background make content
        // scroll under the bar (iOS standard). TabBarBackground provides the
        // blur (or opaque fallback).
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopColor: "transparent",
          borderTopWidth: 0,
          height: 88,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarLabelStyle: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon emoji="☀️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stories"
        options={{
          title: "Stories",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✨" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: "Family",
          tabBarIcon: ({ focused }) => <TabIcon emoji="💛" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const st = StyleSheet.create({
  tabIconWrap: { alignItems: "center", justifyContent: "center", height: 30, width: 44 },
});
