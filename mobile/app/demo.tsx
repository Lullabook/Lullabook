import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { GhostButton, Lead, PrimaryButton, Screen } from "@/components/maya-ui";
import { C, F } from "@/constants/theme";
import { DEMO_STORY, isRenderableDemoStory } from "@/lib/demo-story";
import { markDemoSeen } from "@/lib/first-open-state";

/**
 * Issue 174 (FAIL-5, PERF-4) — the first-open demo Story.
 *
 * The story is a static bundle (mobile/lib/demo-story.ts): no network, no
 * auth, works in airplane mode. FAIL-5: if the bundle is ever unrenderable,
 * we route forward to sign-up instead of showing a blank shell — index.tsx
 * guards this too, but the screen re-checks so a deep link can't bypass it.
 */
export default function DemoScreen() {
  const [page, setPage] = useState(0);

  const story = useMemo(() => DEMO_STORY, []);
  if (!isRenderableDemoStory(story)) {
    void finish();
    return null;
  }

  const isLast = page >= story.pages.length - 1;

  async function finish() {
    await markDemoSeen();
    router.replace("/sign-up");
  }

  return (
    <Screen>
      <View style={st.body}>
        <Text style={st.eyebrow}>A story, just for you</Text>
        <Text style={st.title}>{story.title}</Text>
        <View style={st.pageCard}>
          <Text style={st.pageText}>{story.pages[page].text}</Text>
        </View>
        <View style={st.dots}>
          {story.pages.map((_, i) => (
            <View key={i} style={[st.dot, i === page && st.dotActive]} />
          ))}
        </View>
        {isLast ? (
          <>
            <Lead>Imagine this story starring your little one.</Lead>
            <PrimaryButton title="Create your family" onPress={finish} />
          </>
        ) : (
          <PrimaryButton title="Next" onPress={() => setPage((p) => p + 1)} />
        )}
        <GhostButton title="Skip" onPress={finish} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { flex: 1, justifyContent: "center", gap: 16, padding: 24 },
  eyebrow: {
    fontFamily: F.body,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: C.muted,
    textAlign: "center",
  },
  title: {
    fontFamily: F.display,
    fontSize: 28,
    color: C.text,
    textAlign: "center",
  },
  pageCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 24,
    minHeight: 160,
    justifyContent: "center",
  },
  pageText: {
    fontFamily: F.body,
    fontSize: 18,
    lineHeight: 28,
    color: C.text,
    textAlign: "center",
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.muted,
    opacity: 0.3,
  },
  dotActive: { opacity: 1, backgroundColor: C.text },
});
