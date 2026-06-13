import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function HomeScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHome();
      setHome(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load";
      if (message.includes("Unauthorized") || message.includes("Missing bearer")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  if (loading) {
    return (
      <View style={styles.center} accessibilityLabel="Loading home">
        <ActivityIndicator size="large" color="#6B4F3A" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} accessibilityLabel="Home">
      <Text style={styles.title} accessibilityRole="header">
        Your Family
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {home ? (
        <>
          <Text style={styles.subtitle}>{home.member.email}</Text>
          <Text style={styles.copy} accessibilityLabel="Cold start guidance">
            {home.characters.length === 0 && home.personas.length === 0
              ? "Start with a free Character and text Story — no subscription needed."
              : home.trainingExpectationCopy}
          </Text>
          <View style={styles.card} accessibilityLabel="Characters roster">
            <Text style={styles.cardTitle}>Characters ({home.characters.length})</Text>
            {home.characters.map((c) => (
              <Text key={c.id} style={styles.item}>
                {c.displayName}
              </Text>
            ))}
          </View>
          <View style={styles.card} accessibilityLabel="Personas roster">
            <Text style={styles.cardTitle}>Personas ({home.personas.length})</Text>
            {home.personas.map((p) => (
              <Text key={p.id} style={styles.item}>
                {p.displayName} · {p.status}
              </Text>
            ))}
          </View>
          <Text style={styles.meta}>
            Subscription: {home.subscriptionActive ? "active" : "free tier"}
          </Text>
        </>
      ) : null}
      <Pressable style={styles.button} onPress={load} accessibilityRole="button">
        <Text style={styles.buttonText}>Refresh</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={signOut} accessibilityRole="button">
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFF8F0" },
  container: { padding: 24, backgroundColor: "#FFF8F0", flexGrow: 1 },
  title: { fontSize: 32, fontWeight: "700", color: "#2B1B10", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#6B4F3A", marginBottom: 16 },
  copy: { fontSize: 18, lineHeight: 26, color: "#2B1B10", marginBottom: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8D5C4",
  },
  cardTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8, color: "#2B1B10" },
  item: { fontSize: 16, color: "#4A3728", marginBottom: 4 },
  meta: { fontSize: 14, color: "#6B4F3A", marginVertical: 12 },
  button: {
    backgroundColor: "#6B4F3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { padding: 16, alignItems: "center" },
  secondaryText: { color: "#6B4F3A", fontSize: 16 },
  error: { color: "#B00020", marginBottom: 12 },
});
