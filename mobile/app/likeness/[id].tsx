import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PrimaryButton, Screen } from "@/components/maya-ui";
import { acceptLikeness, fetchLikenessSamples, likenessSampleUrl } from "@/lib/api";

/**
 * Issue 180 — the native Likeness confirmation boundary. Training completion
 * lands here in review; only the authenticated accept call unlocks Stories.
 * Retry reloads server truth so provider failures remain visible and recoverable.
 */
export default function LikenessReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personaId = Array.isArray(id) ? id[0] : id;
  const [samples, setSamples] = useState<string[]>([]);
  const [state, setState] = useState<"review" | "accepting" | "accepted" | "retry">("review");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!personaId) return;
    setError(null);
    try {
      const response = await fetchLikenessSamples(personaId);
      setSamples(response.samples);
      setState("review");
    } catch (cause) {
      setState("retry");
      setError(cause instanceof Error ? cause.message : "Samples are not available yet");
    }
  }, [personaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    if (!personaId) return;
    setState("accepting");
    setError(null);
    try {
      await acceptLikeness(personaId);
      setState("accepted");
    } catch (cause) {
      setState("retry");
      setError(cause instanceof Error ? cause.message : "We couldn't confirm this likeness");
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>LIKEness review</Text>
        <Text style={styles.title}>Does this look like your family member?</Text>
        <Text style={styles.body}>
          Review these generated samples before a Storybook uses the trained likeness.
        </Text>
        <View style={styles.samples}>
          {samples.map((sample) => (
            <Image
              key={sample}
              source={{ uri: likenessSampleUrl(sample) }}
              style={styles.sample}
              accessibilityLabel="Likeness review sample"
            />
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {state === "accepted" ? (
          <PrimaryButton title="Likeness confirmed — make a Story" onPress={() => router.back()} />
        ) : (
          <>
            <PrimaryButton
              title={state === "accepting" ? "Confirming…" : "Accept likeness"}
              disabled={state === "accepting" || samples.length === 0}
              onPress={() => void accept()}
            />
            <PrimaryButton title="Retry / retrain" onPress={() => void load()} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 16 },
  eyebrow: { fontSize: 12, letterSpacing: 1.4, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 23 },
  samples: { gap: 12 },
  sample: { width: "100%", height: 220, borderRadius: 18, backgroundColor: "#eee" },
  error: { color: "#b42318" },
});
