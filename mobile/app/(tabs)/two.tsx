import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";

const LINKS = [
  { icon: "📔", title: "Daily life", note: "Jot the little moments & routine", href: "/daily" },
  { icon: "📚", title: "Storybooks", note: "Generate & read illustrated books", href: "/storybooks" },
  { icon: "🐻", title: "Characters", note: "Invent free, text-only friends", href: "/characters" },
  { icon: "💛", title: "Add family", note: "Photos → a private illustrated persona", href: "/family/new" },
  { icon: "⚙️", title: "Account & privacy", note: "Your plan, family, and data", href: "/account" },
];

export default function MoreScreen() {
  return (
    <Screen>
      <View>
        <Eyebrow>✨ More</Eyebrow>
        <PageTitle>Everything else</PageTitle>
        <Lead>Capture daily moments, invent characters, add family, and manage your account.</Lead>
      </View>

      {LINKS.map((l) => (
        <Pressable key={l.href} onPress={() => router.push(l.href as never)} style={st.row} accessibilityRole="button" accessibilityLabel={l.title}>
          <View style={st.iconWrap}>
            <Text style={{ fontSize: 22 }}>{l.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{l.title}</Text>
            <Text style={st.note}>{l.note}</Text>
          </View>
          <Text style={st.chev}>›</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 76,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: F.displayBold, fontSize: 17, color: C.text },
  note: { color: C.muted, fontFamily: F.body, fontSize: 13, marginTop: 2 },
  chev: { color: C.soft, fontSize: 26, fontFamily: F.bodyBold },
});
