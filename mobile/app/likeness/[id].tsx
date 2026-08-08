import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { PrimaryButton, Screen, Skeleton } from "@/components/maya-ui";
import { C } from "@/constants/theme";
import { acceptLikeness, fetchLikenessSamples, likenessSampleUrl, retrainLikeness } from "@/lib/api";
import { appendNativeFile } from "@/lib/form-data";

/**
 * Issue 180 — the native Likeness confirmation boundary. Training completion
 * lands here in review; only the authenticated accept call unlocks Stories.
 * Retry reloads server truth so provider failures remain visible and recoverable.
 */
export default function LikenessReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personaId = Array.isArray(id) ? id[0] : id;
  const [samples, setSamples] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"review" | "accepting" | "accepted" | "retry" | "retraining">("review");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!personaId) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetchLikenessSamples(personaId);
      setSamples(response.samples);
      setState("review");
    } catch (cause) {
      setState("retry");
      setError(cause instanceof Error ? cause.message : "Samples are not available yet");
    } finally {
      setLoading(false);
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

  const retrain = async () => {
    if (!personaId || state === "retraining") return;
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setState("retry");
        setError("Photo library access is required to retrain this likeness.");
        return;
      }
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
      });
      if (selection.canceled) return;
      const selectedPhotos = selection.assets;
      if (selectedPhotos.length < 3) {
        setState("retry");
        setError("Choose at least 3 clear photos to retrain this likeness.");
        return;
      }
      setState("retraining");
      const formData = new FormData();
      selectedPhotos.forEach((asset, index) => {
        appendNativeFile(formData, "photos", {
          uri: asset.uri,
          name: asset.fileName ?? `replacement-${index + 1}.jpg`,
          type: asset.mimeType ?? "image/jpeg",
        });
      });
      await retrainLikeness(personaId, formData);
      setSamples([]);
      setState("review");
      setError("Replacement photos uploaded. Your new likeness will be ready for review shortly.");
    } catch (cause) {
      setState("retry");
      setError(cause instanceof Error ? cause.message : "We couldn't start retraining this likeness");
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
          {loading ? (
            <>
              <View style={styles.sample}>
                <Skeleton style={styles.sampleFill} />
              </View>
              <View style={styles.sample}>
                <Skeleton style={styles.sampleFill} />
              </View>
            </>
          ) : (
            samples.map((sample) => (
              <Image
                key={sample}
                source={{ uri: likenessSampleUrl(sample) }}
                style={styles.sample}
                accessibilityLabel="Likeness review sample"
              />
            ))
          )}
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
            <PrimaryButton
              title={state === "retraining" ? "Uploading replacement photos…" : "Retry / retrain"}
              disabled={state === "retraining"}
              onPress={() => void retrain()}
            />
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
  sample: { width: "100%", height: 220, borderRadius: 18, backgroundColor: C.borderSoft, overflow: "hidden" },
  sampleFill: { width: "100%", height: "100%", borderRadius: 0 },
  error: { color: C.danger },
});
