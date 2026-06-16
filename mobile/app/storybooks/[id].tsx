import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen, Eyebrow, PageTitle, Lead, Card } from "@/components/maya-ui";
import { C, F } from "@/constants/theme";

export default function StorybookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <View>
        <Eyebrow>📚 Story</Eyebrow>
        <PageTitle>Story draft saved</PageTitle>
        <Lead>This mobile reader route is ready for the curated illustrated Storybook reader.</Lead>
      </View>

      <Card>
        <Text style={st.title}>Story ID</Text>
        <Text style={st.copy}>{id}</Text>
        <Text style={st.note}>
          Text generation runs in the create screen today. Illustrated reader curation will plug into this route next.
        </Text>
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  title: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  copy: { fontFamily: F.bodyBold, fontSize: 14, color: C.primary },
  note: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.muted },
});
