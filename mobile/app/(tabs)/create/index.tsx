import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, Chip, PrimaryButton, SkeletonCard } from "@/components/maya-ui";
import { createStorybook, fetchHome, type HomeResponse } from "@/lib/api";
import { isR1MultiStoryTypeEnabled } from "@/lib/r1-flags";
import { C, F } from "@/constants/theme";
import type { StoryType } from "@domain/types";

const ALL_STORY_TYPES: { key: StoryType; icon: string; label: string }[] = [
  { key: "bedtime", icon: "🌙", label: "Bedtime" },
  { key: "adventure", icon: "🚀", label: "Adventure" },
  { key: "silly", icon: "😄", label: "Silly" },
  { key: "learning", icon: "🌟", label: "Learning" },
];

// R1 cut — Bedtime only ships; other types stay flag-gated for R2 (no
// reachable UI for a deferred type, per "inert, not broken").
const STORY_TYPES = isR1MultiStoryTypeEnabled()
  ? ALL_STORY_TYPES
  : ALL_STORY_TYPES.filter((t) => t.key === "bedtime");

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
      router.replace(`/stories/${result.storybookId}` as never);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not generate Storybook";
      setError(message.includes("subscription") ? "Illustrated Stories need an active plan." : message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </Screen>
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
          Pick who stars and what tonight&apos;s story is about — we&apos;ll write and illustrate it page by page.
        </Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {!subscribed ? (
        <Card>
          <Text style={st.cardTitle}>🌙 Start your free trial</Text>
          <Text style={st.copy}>
            Illustrated Storybooks come with your plan — every plan starts with a 7-day free trial.
          </Text>
          <PrimaryButton title="✨ See plans" onPress={() => router.push("/billing" as never)} />
          {__DEV__ ? (
            <Text style={st.devHint}>Dev: run `npm run dev:paid` to force-unlock the full path in Simulator.</Text>
          ) : null}
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
            <Text style={st.cardTitle}>Tonight&apos;s story</Text>
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
            {!isR1MultiStoryTypeEnabled() ? (
              <Text style={st.copy}>A calming wind-down arc with a soft landing — made for bedtime.</Text>
            ) : null}
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
  cardTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  copy: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted },
  devHint: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.soft },
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
