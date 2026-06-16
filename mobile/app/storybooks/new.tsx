import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, Chip, PrimaryButton } from "@/components/maya-ui";
import { createTextStory, fetchHome, type HomeResponse } from "@/lib/api";
import { C, F } from "@/constants/theme";
import type { StoryType } from "@domain/types";

const STORY_TYPES: { key: StoryType; icon: string; label: string }[] = [
  { key: "bedtime", icon: "🌙", label: "Bedtime" },
  { key: "adventure", icon: "🚀", label: "Adventure" },
  { key: "silly", icon: "😄", label: "Silly" },
  { key: "lesson", icon: "🌟", label: "Learning" },
];

export default function NewStoryScreen() {
  const params = useLocalSearchParams<{ theme?: string }>();
  const initialTheme = useMemo(() => {
    const value = Array.isArray(params.theme) ? params.theme[0] : params.theme;
    return value ?? "A cozy day full of tiny brave moments";
  }, [params.theme]);
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [storyType, setStoryType] = useState<StoryType>("bedtime");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyText, setStoryText] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHome();
      setHome(data);
      setSelectedCharacterId(data.characters[0]?.id ?? null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load story setup";
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

  async function generate() {
    if (!selectedCharacterId || !theme.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setStoryText(null);
    try {
      const story = await createTextStory({
        starringCharacterIds: [selectedCharacterId],
        storyType,
        theme: theme.trim(),
      });
      setStoryText(story.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate story");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const characters = home?.characters ?? [];

  return (
    <Screen>
      <View>
        <Eyebrow>✨ Create</Eyebrow>
        <PageTitle>Turn a moment into a story</PageTitle>
        <Lead>Pick a Character, choose the story shape, and make a free text Story before adding illustrations.</Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {characters.length === 0 ? (
        <Card>
          <Text style={st.cardTitle}>Start with a Character</Text>
          <Text style={st.copy}>Text stories need at least one photo-free Character. Made-up friends are always free.</Text>
          <PrimaryButton title="🐻 Invent a character" onPress={() => router.push("/characters/new" as never)} />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={st.cardTitle}>Who stars?</Text>
            <View style={st.chipRow}>
              {characters.map((character) => (
                <Chip
                  key={character.id}
                  icon="🐻"
                  label={character.displayName}
                  active={selectedCharacterId === character.id}
                  onPress={() => setSelectedCharacterId(character.id)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={st.cardTitle}>Story type</Text>
            <View style={st.chipRow}>
              {STORY_TYPES.map((type) => (
                <Chip
                  key={type.key}
                  icon={type.icon}
                  label={type.label}
                  active={storyType === type.key}
                  onPress={() => setStoryType(type.key)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={st.cardTitle}>Theme from today</Text>
            <TextInput
              value={theme}
              onChangeText={setTheme}
              multiline
              placeholder="What should this story be about?"
              placeholderTextColor="#B7A992"
              style={st.textarea}
            />
            <PrimaryButton
              title={generating ? "Writing…" : "✨ Write text Story"}
              disabled={!selectedCharacterId || !theme.trim() || generating}
              onPress={generate}
            />
          </Card>
        </>
      )}

      {storyText ? (
        <Card>
          <Text style={st.cardTitle}>📚 Your draft Story</Text>
          <Text style={st.story}>{storyText}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  cardTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  copy: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  textarea: {
    minHeight: 96,
    fontFamily: F.body,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    textAlignVertical: "top",
  },
  story: { fontFamily: F.body, color: C.text, fontSize: 16, lineHeight: 25 },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
