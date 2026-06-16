import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CharacterForm, type CharacterFormValues } from "@/components/character-form";
import { fetchCharacter } from "@/lib/api";
import { C } from "@/constants/theme";

function toFormValues(character: {
  questionnaire: import("@domain/types").TraitQuestionnaire;
}): CharacterFormValues {
  const q = character.questionnaire;
  return {
    name: q.name,
    nickname: q.nickname ?? "",
    people: (q.relationships ?? []).join(", "),
    animals: (q.favoriteAnimals ?? []).join(", "),
    toys: (q.favoriteToys ?? []).join(", "),
    songs: (q.songs ?? []).join(", "),
    traits: (q.topics ?? []).join(", "),
    isFictional: q.isFictional,
  };
}

export default function EditCharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const characterId = Array.isArray(id) ? id[0] : id;
  const [initial, setInitial] = useState<CharacterFormValues | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!characterId) return;
    try {
      const data = await fetchCharacter(characterId);
      setInitial(toFormValues(data.character));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load character";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!initial || !characterId) {
    return null;
  }

  return <CharacterForm initial={initial} isEdit characterId={characterId} key={characterId} />;
}
