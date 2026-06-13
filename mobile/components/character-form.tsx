import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, Field, Chip, PrimaryButton, GhostButton } from "@/components/maya-ui";
import { C } from "@/constants/theme";

export interface CharacterFormValues {
  name: string;
  nickname: string;
  people: string;
  animals: string;
  toys: string;
  songs: string;
  traits: string;
  isFictional: boolean;
}

const EMPTY: CharacterFormValues = { name: "", nickname: "", people: "", animals: "", toys: "", songs: "", traits: "", isFictional: true };

function emoji(name: string) {
  const l = name.toLowerCase();
  if (l.includes("cat") || l.includes("coco")) return "🐱";
  if (l.includes("dragon") || l.includes("pip")) return "🐲";
  if (l.includes("moon")) return "🌙";
  if (l.includes("bear")) return "🐻";
  if (l.includes("bunny") || l.includes("rabbit")) return "🐰";
  return "🧸";
}
const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

function describe(v: CharacterFormValues) {
  const name = v.name.trim() || "Your character";
  const traits = split(v.traits), animals = split(v.animals), toys = split(v.toys);
  let s = name + (traits.length ? ` is ${traits.slice(0, 3).join(", ").toLowerCase()}` : " is a brand-new friend");
  if (animals.length) s += `, loves ${animals.slice(0, 2).join(" and ")}`;
  if (toys.length) s += `, never far from ${toys[0]}`;
  return s + ".";
}

export function CharacterForm({ initial, isEdit }: { initial?: Partial<CharacterFormValues>; isEdit?: boolean }) {
  const [v, setV] = useState<CharacterFormValues>({ ...EMPTY, ...initial });
  const set = (k: keyof CharacterFormValues, val: string | boolean) => setV((p) => ({ ...p, [k]: val }));
  const ready = v.name.trim().length > 0;

  function submit() {
    if (!ready) return;
    // TODO: call create/update character API with the questionnaire payload, then:
    router.replace("/characters" as never);
  }

  return (
    <Screen>
      <View>
        <Eyebrow>{isEdit ? "🐻 Edit character" : "🐻 Invent a character"}</Eyebrow>
        <PageTitle>{isEdit ? `Edit ${v.name || "character"}` : "Invent a made-up friend"}</PageTitle>
        <Lead>Every detail becomes a thread the story can weave in. No photos, no subscription — made-up friends are always free.</Lead>
      </View>

      {/* live card preview */}
      <View style={st.preview}>
        <View style={[st.previewAvatar, { backgroundColor: v.isFictional ? "#8B6DF0" : C.green }]}><Text style={{ fontSize: 28 }}>{emoji(v.name)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={st.previewName}>{v.name.trim() || "Your character"}</Text>
          <Text style={st.previewSub}>{isEdit ? "Appears in your stories" : "New · not in a story yet"}</Text>
          <Text style={st.previewDesc}>{describe(v)}</Text>
          <View style={st.tagRow}>
            {split(v.traits).slice(0, 4).map((t) => (
              <View key={t} style={st.tag}><Text style={st.tagText}>{t}</Text></View>
            ))}
          </View>
        </View>
      </View>

      <Card>
        <Text style={st.h}>Who is this character?</Text>
        <View style={st.chipRow}>
          <Chip icon="🐉" label="Made-up friend" active={v.isFictional} onPress={() => set("isFictional", true)} />
          <Chip icon="👶" label="A real child" active={!v.isFictional} onPress={() => set("isFictional", false)} />
        </View>
      </Card>

      <Card>
        <Field label="Name" placeholder="Pip" value={v.name} onChangeText={(t) => set("name", t)} />
        <Field label="Nickname (optional)" placeholder="Pippin" value={v.nickname} onChangeText={(t) => set("nickname", t)} />
        <Field label="Important people (comma separated)" placeholder="Maya, Dada, big brother Theo" value={v.people} onChangeText={(t) => set("people", t)} />
        <Field label="Favorite animals" placeholder="dragons, fireflies" value={v.animals} onChangeText={(t) => set("animals", t)} />
        <Field label="Favorite toys" placeholder="a tiny lantern" value={v.toys} onChangeText={(t) => set("toys", t)} />
        <Field label="Songs they love" placeholder="Twinkle Twinkle" value={v.songs} onChangeText={(t) => set("songs", t)} />
        <Field label="Traits & things they love" placeholder="Brave, Tiny, Glows in the dark" value={v.traits} onChangeText={(t) => set("traits", t)} />
      </Card>

      {!v.isFictional && (
        <Card>
          <Text style={st.help}>I am this child&apos;s parent or guardian, or I have their guardian&apos;s permission to describe them in stories.</Text>
        </Card>
      )}

      <PrimaryButton title={isEdit ? "✓ Save changes" : "✨ Create character"} disabled={!ready} onPress={submit} />
      {isEdit && <GhostButton danger title="Delete character" onPress={() => { /* TODO: delete character API */ }} />}
    </Screen>
  );
}

const st = StyleSheet.create({
  h: { fontWeight: "800", fontSize: 17, color: C.text },
  help: { color: C.muted, fontSize: 14, lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preview: { flexDirection: "row", gap: 14, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 22, padding: 18 },
  previewAvatar: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  previewName: { fontWeight: "800", fontSize: 18, color: C.text },
  previewSub: { color: C.soft, fontSize: 13, fontWeight: "700", marginTop: 1 },
  previewDesc: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { backgroundColor: C.primaryBg, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  tagText: { color: C.primary, fontSize: 12, fontWeight: "700" },
});
