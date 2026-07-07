import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, EmptyState, PrimaryButton, SkeletonCard, BrandGradient } from "@/components/maya-ui";
import { emoji as emojiFor } from "@/components/character-form";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { fetchHome, type HomeResponse } from "@/lib/api";
import { C, F, R } from "@/constants/theme";
import type { Character } from "@domain/types";

const AnimatedPressable = createAnimatedComponent(Pressable);

// Canonical AVATAR_GRADIENTS (src/components/v2/tokens.ts) — same five cast
// accents used for Family roster avatars, so characters share the palette.
const AVATAR_GRADIENTS: [string, string][] = [
  ["#8B6DF0", "#6A55C9"],
  ["#E79A3C", "#F6C177"],
  ["#E78AA0", "#F2A6B8"],
  ["#5FB389", "#9FD8B1"],
  ["#3f9bb0", "#7fc8c0"],
];

/** Tappable character card → the edit screen (press feedback + a11y). */
function CharacterCard({ character, index }: { character: Character; index: number }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  const gradient = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]!;
  const tags = (character.questionnaire.topics ?? []).slice(0, 3).filter(Boolean);

  return (
    <AnimatedPressable
      onPress={() => router.push(`/characters/${character.id}` as never)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${character.displayName}`}
      style={[st.card, style]}
    >
      <View style={st.cardHead}>
        <BrandGradient colors={gradient} fallback={C.primaryLight} style={st.avatar}>
          <Text style={st.avatarEmoji}>{emojiFor(character.displayName)}</Text>
        </BrandGradient>
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{character.displayName}</Text>
          <Text style={st.subtitle}>
            {character.promotedPersonaId ? "Made-up friend · upgraded to Persona" : "Made-up friend"}
          </Text>
        </View>
        <Text style={st.chev}>›</Text>
      </View>
      <Text style={st.description}>{character.description}</Text>
      {tags.length > 0 && (
        <View style={st.tagRow}>
          {tags.map((t) => (
            <View key={t} style={st.tag}>
              <Text style={st.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={st.divider} />
      <Text style={st.meta}>Tap to edit character →</Text>
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

  const babyName = home?.selectedBaby?.displayName ?? "your little one";

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <View>
        <Eyebrow>🐻 Made-up friends</Eyebrow>
        <PageTitle>Characters</PageTitle>
        <Lead>
          Imaginary friends you invent for {babyName}&apos;s world — a brave little dragon, a sleepy moon, a cat
          who talks. Free to create from a few traits.
        </Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {home?.characters.length ? (
        home.characters.map((character, i) => <CharacterCard key={character.id} character={character} index={i} />)
      ) : (
        <EmptyState
          emoji="🧸"
          title="Describe someone your little one loves"
          hint="A character is just a description — a name, favorite animals, a beloved song. No photos, no subscription. Stories start here."
          cta="Create your first character"
          onCta={() => router.push("/characters/new" as never)}
        />
      )}

      {home?.characters.length ? (
        <PrimaryButton title="✨ Invent a character" onPress={() => router.push("/characters/new" as never)} />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 20,
    gap: 12,
    shadowColor: "#3A2850",
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: R.detail - 6, alignItems: "center", justifyContent: "center" },
  avatarEmoji: { fontSize: 26 },
  name: { fontFamily: F.displayBold, fontSize: 19, color: C.text },
  subtitle: { fontFamily: F.bodyBold, fontSize: 12, color: C.soft, marginTop: 1 },
  description: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.muted },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: C.primaryBg, borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 4 },
  tagText: { color: C.primary, fontSize: 12, fontFamily: F.bodyBold },
  divider: { height: 1, backgroundColor: C.borderSoft },
  meta: { fontFamily: F.bodyBold, fontSize: 13, color: C.primary },
  chev: { color: C.soft, fontSize: 22, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
