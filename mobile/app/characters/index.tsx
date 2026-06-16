import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, PrimaryButton } from "@/components/maya-ui";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { C, F } from "@/constants/theme";

export default function CharactersScreen() {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHome(await fetchHome());
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load characters";
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

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <Screen>
      <View>
        <Eyebrow>🐻 Characters</Eyebrow>
        <PageTitle>Made-up friends</PageTitle>
        <Lead>Photo-free Characters keep the free text-story tier playful, private, and quick to test.</Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {home?.characters.length ? (
        home.characters.map((character) => (
          <Card key={character.id}>
            <Text style={st.name}>🧸 {character.displayName}</Text>
            <Text style={st.description}>{character.description}</Text>
            <Text style={st.meta}>Ready for text-only stories</Text>
          </Card>
        ))
      ) : (
        <Card>
          <Text style={st.name}>No Characters yet</Text>
          <Text style={st.description}>
            Invent a dragon, moon bunny, teddy, or other cozy friend. No photos or subscription needed.
          </Text>
        </Card>
      )}

      <PrimaryButton title="✨ Invent a character" onPress={() => router.push("/characters/new" as never)} />
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  name: { fontFamily: F.displayBold, fontSize: 20, color: C.text },
  description: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted },
  meta: { fontFamily: F.bodyBold, fontSize: 13, color: C.primary, marginTop: 2 },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
