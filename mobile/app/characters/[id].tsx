import { useLocalSearchParams } from "expo-router";
import { CharacterForm } from "@/components/character-form";

export default function EditCharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // TODO: fetch the character by `id` and pass its questionnaire as `initial`.
  // Demo seed so the screen renders standalone:
  const initial = {
    name: "Pip",
    nickname: "Pippin",
    people: "Maya, Dada",
    animals: "dragons, fireflies",
    toys: "a tiny lantern",
    songs: "Twinkle Twinkle",
    traits: "Brave, Tiny, Glows in the dark",
    isFictional: true,
  };
  return <CharacterForm initial={initial} isEdit key={id} />;
}
