import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getStartupMilestones } from "@/lib/startup-timing";

/**
 * Issue 191 — dev-only timing overlay. Rendered only from the root layout's
 * `__DEV__` gate; inside the app it shows the startup milestones (process
 * start → interactive → first read) so a perf pass can eyeball cold-start
 * without instrumenting screens. Never touch-blocking and never rendered in
 * production builds.
 */
export function StartupTimingOverlay() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const items = getStartupMilestones();
  if (items.length === 0) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      {items.map((m) => (
        <Text key={m.name} style={styles.line}>
          {m.name} {m.ms}ms
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 56,
    right: 12,
    zIndex: 9999,
    backgroundColor: "rgba(20, 10, 30, 0.72)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  line: {
    color: "#F6E9C8",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
