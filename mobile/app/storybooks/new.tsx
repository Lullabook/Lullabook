import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, Chip, PrimaryButton } from "@/components/maya-ui";
import { createStorybook, fetchHome, type HomeResponse } from "@/lib/api";
import { C, F } from "@/constants/theme";
import type { StoryType } from "@domain/types";

const STORY_TYPES: { key: StoryType; icon: string; label: string }[] = [
  { key: "bedtime", icon: "🌙", label: "Bedtime" },
  { key: "adventure", icon: "🚀", label: "Adventure" },
  { key: "silly", icon: "😄", label: "Silly" },
  { key: "learning", icon: "🌟", label: "Learning" },
];

export default function NewStorybookScreen() {
  const params = useLocalSearchParams<{ theme?: string }>();
  const initialTheme = useMemo(() => {
    const value = Array.isArray(params.theme) ? params.theme[0] : params.theme;
    return value ?? "A cozy day full of tiny brave moments";
  }, [params.theme]);

  const [home, setHome] = useState<HomeResponse | null>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [storyType, setStoryType] = useState<StoryType>("bedtime");
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHome();
      setHome(data);
      const readyPersonas = data.personas.filter((p) => p.status === "ready").map((p) => p.id);
      setSelectedPersonaIds(readyPersonas.slice(0, 1));
      setSelectedCharacterIds(data.characters[0]?.id ? [data.characters[0].id] : []);
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

  function togglePersona(id: string) {
    setSelectedPersonaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleCharacter(id: string) {
    setSelectedCharacterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function generate() {
    if (!theme.trim() || generating) return;
    const starringPersonaIds = selectedPersonaIds;
    const starringCharacterIds = selectedCharacterIds;
    if (starringPersonaIds.length === 0 && starringCharacterIds.length === 0) return;

    setGenerating(true);
    setError(null);
    try {
      const result = await createStorybook({
        starringPersonaIds,
        starringCharacterIds: starringCharacterIds.length ? starringCharacterIds : undefined,
        babyId: home?.selectedBaby?.id,
        storyType,
        theme: theme.trim(),
      });
      router.replace(`/storybooks/${result.storybookId}` as never);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not generate Storybook";
      setError(message.includes("subscription") ? "Illustrated Stories need an active plan." : message);
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

  const personas = home?.personas.filter((p) => p.status === "ready") ?? [];
  const characters = home?.characters ?? [];
  const hasCast = personas.length > 0 || characters.length > 0;
  const subscribed = home?.subscriptionActive ?? false;

  return (
    <Screen>
      <View>
        <Eyebrow>✨ Create</Eyebrow>
        <PageTitle>Make an illustrated Storybook</PageTitle>
        <Lead>
          Confirm the Story Type and theme before we spend a generation — seeded from your Moment if you came from Journal.
        </Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {!subscribed ? (
        <Card>
          <Text style={st.cardTitle}>Subscription required</Text>
          <Text style={st.copy}>
            Illustrated Storybooks need an active plan. Run the paid backend locally (`npm run dev:paid`) to try the full path in Simulator.
          </Text>
        </Card>
      ) : !hasCast ? (
        <Card>
          <Text style={st.cardTitle}>Add someone to star</Text>
          <Text style={st.copy}>Add a family Persona or invent a Character first.</Text>
          <PrimaryButton title="🐻 Invent a character" onPress={() => router.push("/characters/new" as never)} />
        </Card>
      ) : (
        <>
          {personas.length > 0 ? (
            <Card>
              <Text style={st.cardTitle}>Family starring</Text>
              <View style={st.chipRow}>
                {personas.map((p) => (
                  <Chip
                    key={p.id}
                    icon="💛"
                    label={p.displayName}
                    active={selectedPersonaIds.includes(p.id)}
                    onPress={() => togglePersona(p.id)}
                  />
                ))}
              </View>
            </Card>
          ) : null}

          {characters.length > 0 ? (
            <Card>
              <Text style={st.cardTitle}>Characters</Text>
              <View style={st.chipRow}>
                {characters.map((c) => (
                  <Chip
                    key={c.id}
                    icon="🐻"
                    label={c.displayName}
                    active={selectedCharacterIds.includes(c.id)}
                    onPress={() => toggleCharacter(c.id)}
                  />
                ))}
              </View>
            </Card>
          ) : null}

          <Card>
            <Text style={st.cardTitle}>Story type — confirm before generating</Text>
            <View style={st.chipRow}>
              {STORY_TYPES.map((t) => (
                <Chip
                  key={t.key}
                  icon={t.icon}
                  label={t.label}
                  active={storyType === t.key}
                  onPress={() => setStoryType(t.key)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={st.cardTitle}>Theme</Text>
            <TextInput
              value={theme}
              onChangeText={setTheme}
              multiline
              placeholder="What should this Storybook be about?"
              placeholderTextColor="#B7A992"
              style={st.textarea}
            />
            <PrimaryButton
              title={generating ? "Starting…" : "✨ Generate illustrated Storybook"}
              disabled={
                !theme.trim() ||
                generating ||
                (selectedPersonaIds.length === 0 && selectedCharacterIds.length === 0)
              }
              onPress={generate}
            />
          </Card>
        </>
      )}
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
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
