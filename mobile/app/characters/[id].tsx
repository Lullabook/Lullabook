import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { CharacterForm, type CharacterFormValues } from "@/components/character-form";
import { EmptyState, Screen, SkeletonCard } from "@/components/maya-ui";
import { fetchCharacter } from "@/lib/api";

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
      <Screen>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }

  if (!initial || !characterId) {
    // Never a blank screen — a warm dead-end with a way back.
    return (
      <Screen>
        <EmptyState
          emoji="🐻"
          title="We couldn't find this character"
          hint="They may have wandered into another story. Head back and try again."
          cta="← Back to characters"
          onCta={() => router.replace("/characters" as never)}
        />
      </Screen>
    );
  }

  return <CharacterForm initial={initial} isEdit characterId={characterId} key={characterId} />;
}
