import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { Screen, Eyebrow, Lead, Card, EmptyState, PrimaryButton, SkeletonCard } from "@/components/maya-ui";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { C, F } from "@/constants/theme";
import type { Character } from "@domain/types";

const AnimatedPressable = createAnimatedComponent(Pressable);

/** Tappable character card → the edit screen (press feedback + a11y). */
function CharacterCard({ character }: { character: Character }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={() => router.push(`/characters/${character.id}` as never)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${character.displayName}`}
      style={[st.card, style]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[st.name, { flex: 1 }]}>🧸 {character.displayName}</Text>
        <Text style={st.chev}>›</Text>
      </View>
      <Text style={st.description}>{character.description}</Text>
      <Text style={st.meta}>Ready for stories · tap to edit</Text>
    </AnimatedPressable>
  );
}

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
      <Screen>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View>
        <Eyebrow>🐻 Characters</Eyebrow>
        <Lead>Invent photo-free friends — dragons, moon bunnies, teddies — to star alongside your family.</Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {home?.characters.length ? (
        home.characters.map((character) => (
          <CharacterCard key={character.id} character={character} />
        ))
      ) : (
        <EmptyState
          emoji="🐻"
          title="No made-up friends yet"
          hint="Invent a dragon, moon bunny, teddy, or other cozy friend. No photos needed — they're always free."
        />
      )}

      <PrimaryButton title="✨ Invent a character" onPress={() => router.push("/characters/new" as never)} />
    </Screen>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    gap: 10,
  },
  name: { fontFamily: F.displayBold, fontSize: 20, color: C.text },
  description: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted },
  meta: { fontFamily: F.bodyBold, fontSize: 13, color: C.primary, marginTop: 2 },
  chev: { color: C.soft, fontSize: 22, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
