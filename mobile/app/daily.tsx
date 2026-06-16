import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card } from "@/components/maya-ui";
import { C, F } from "@/constants/theme";

type MomentType = "milestone" | "first" | "funny" | "tough" | "cozy";
const TYPES: { key: MomentType; icon: string; label: string }[] = [
  { key: "milestone", icon: "🌟", label: "Milestone" },
  { key: "first", icon: "✨", label: "A first" },
  { key: "funny", icon: "😄", label: "Funny" },
  { key: "tough", icon: "🫂", label: "Tough day" },
  { key: "cozy", icon: "🌙", label: "Cozy" },
];
function meta(t: MomentType) {
  switch (t) {
    case "first": return { icon: "✨", label: "A first", bg: "#FBEBCE", fg: "#9A6B1E" };
    case "funny": return { icon: "😄", label: "Funny", bg: "#FCE4EC", fg: "#B5618A" };
    case "tough": return { icon: "🫂", label: "Tough day", bg: "#E1F1E8", fg: "#3E7A5A" };
    case "cozy": return { icon: "🌙", label: "Cozy", bg: C.primaryBg, fg: C.primary };
    default: return { icon: "🌟", label: "Milestone", bg: "#EDE7FE", fg: "#6A55C9" };
  }
}
const ROUTINE = [
  { time: "6:45 AM", icon: "🌅", label: "Wakes up, cuddles" },
  { time: "7:30 AM", icon: "🥣", label: "Breakfast" },
  { time: "9:30 AM", icon: "😴", label: "Morning nap" },
  { time: "11:00 AM", icon: "🧸", label: "Playtime & books" },
  { time: "1:00 PM", icon: "😴", label: "Afternoon nap" },
  { time: "5:30 PM", icon: "🍽️", label: "Dinner" },
  { time: "6:45 PM", icon: "🛁", label: "Bath time" },
  { time: "7:30 PM", icon: "🌙", label: "Lullaby & bed" },
];

interface Moment { id: string; type: MomentType; text: string; date: string }

export default function DailyScreen() {
  const [moments, setMoments] = useState<Moment[]>([
    { id: "1", type: "milestone", text: "Pulled herself up to standing at the coffee table and grinned like she'd won a medal.", date: "Today" },
    { id: "2", type: "cozy", text: "Long bath, then fell asleep mid-lullaby with Coco the cat tucked under her arm.", date: "Yesterday" },
    { id: "3", type: "funny", text: "Blew raspberries at her sweet potato until the whole kitchen was laughing.", date: "2 days ago" },
  ]);
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<MomentType>("milestone");

  function add() {
    const text = draft.trim();
    if (!text) return;
    // Moment persistence is a separate backend slice; keep this flow testable locally.
    setMoments((p) => [{ id: `tmp-${Date.now()}`, type, text, date: "Today · just now" }, ...p]);
    setDraft("");
  }

  return (
    <Screen>
      <View>
        <Eyebrow>📔 Their days</Eyebrow>
        <PageTitle>Daily life</PageTitle>
        <Lead>Jot down the little moments and the routine. Lullabook weaves them into stories that feel like real days — and they make the baby&apos;s persona richer.</Lead>
      </View>

      {/* add a moment */}
      <Card>
        <Text style={st.h}>What happened today?</Text>
        <TextInput
          value={draft} onChangeText={setDraft} multiline placeholder="Waved bye-bye to Nani all by herself…"
          placeholderTextColor="#B7A992" style={st.textarea}
        />
        <View style={st.chipRow}>
          {TYPES.map((t) => {
            const active = type === t.key;
            return (
              <Pressable key={t.key} onPress={() => setType(t.key)} style={[st.chip, { borderColor: active ? C.primaryLight : C.border, backgroundColor: active ? C.primaryBg : C.surface }]}>
                <Text style={[st.chipText, { color: active ? C.primary : C.muted }]}>{t.icon} {t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={add} disabled={!draft.trim()} style={[st.addBtn, { backgroundColor: draft.trim() ? C.primary : "#E7DCCB" }]}>
          <Text style={[st.addBtnText, { color: draft.trim() ? C.surface : C.soft }]}>＋ Add moment</Text>
        </Pressable>
      </Card>

      {/* feed */}
      <Text style={st.section}>Recent moments</Text>
      {moments.map((m) => {
        const mm = meta(m.type);
        return (
          <View key={m.id} style={st.moment}>
            <View style={[st.momentIcon, { backgroundColor: mm.bg }]}><Text style={{ fontSize: 22 }}>{mm.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={st.momentMetaRow}>
                <View style={[st.tag, { backgroundColor: mm.bg }]}><Text style={[st.tagText, { color: mm.fg }]}>{mm.label}</Text></View>
                <Text style={st.momentDate}>{m.date}</Text>
              </View>
              <Text style={st.momentText}>{m.text}</Text>
              <Pressable onPress={() => router.push({ pathname: "/storybooks/new", params: { theme: m.text } } as never)} style={st.turnBtn}>
                <Text style={st.turnBtnText}>✨ Turn into a story</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* routine */}
      <Card>
        <Text style={st.h}>🕒 Their usual day</Text>
        {ROUTINE.map((r) => (
          <View key={r.label} style={st.routineRow}>
            <Text style={st.routineTime}>{r.time}</Text>
            <Text style={{ fontSize: 16 }}>{r.icon}</Text>
            <Text style={st.routineLabel}>{r.label}</Text>
          </View>
        ))}
      </Card>

      <View style={st.why}>
        <Text style={st.whyTitle}>Why this helps ✨</Text>
        <Text style={st.whyText}>Real moments and routines teach Lullabook who the baby is — favorite times of day, what delights them — so every story sounds like their actual life.</Text>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  h: { fontFamily: F.displayBold, fontSize: 17, color: C.text },
  textarea: { minHeight: 84, fontFamily: F.body, fontSize: 16, color: C.text, backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 13, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 13 },
  chipText: { fontFamily: F.bodyBold, fontSize: 13 },
  addBtn: { minHeight: 48, borderRadius: 999, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  addBtnText: { fontFamily: F.bodyBold, fontSize: 15 },
  section: { fontFamily: F.displayBold, fontSize: 22, color: C.text, marginTop: 4 },
  moment: { flexDirection: "row", gap: 12, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 16 },
  momentIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  momentMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 12, fontFamily: F.bodyBold },
  momentDate: { fontSize: 12, color: C.faint, fontFamily: F.bodyBold },
  momentText: { color: C.text, fontFamily: F.body, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  turnBtn: { alignSelf: "flex-start", minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center" },
  turnBtnText: { color: C.primary, fontFamily: F.bodyBold, fontSize: 13 },
  routineRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F4ECDC" },
  routineTime: { width: 78, fontSize: 13, fontFamily: F.bodyBold, color: C.soft },
  routineLabel: { fontSize: 15, color: C.text, fontFamily: F.bodyBold },
  why: { backgroundColor: C.primary, borderRadius: 20, padding: 18, gap: 6 },
  whyTitle: { color: C.surface, fontFamily: F.displayBold, fontSize: 16 },
  whyText: { color: "#FBEAF3", fontFamily: F.body, fontSize: 14, lineHeight: 21 },
});
