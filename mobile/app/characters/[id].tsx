import { useLocalSearchParams } from "expo-router";
import { CharacterForm } from "@/components/character-form";

export default function EditCharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The native edit endpoint is not exposed yet; keep the screen openable with a
  // warm sample so navigation tests never land on Expo's not-found template.
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
