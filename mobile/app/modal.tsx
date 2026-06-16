import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, Text } from "react-native";

import { Screen, Card, Eyebrow, PageTitle, Lead } from "@/components/maya-ui";
import { C, F } from "@/constants/theme";

export default function ModalScreen() {
  return (
    <Screen>
      <Eyebrow>✨ Preview</Eyebrow>
      <PageTitle>Storybook modal</PageTitle>
      <Lead>This placeholder is ready for future native sheet flows.</Lead>
      <Card>
        <Text style={styles.title}>Nothing needs your attention here yet.</Text>
      </Card>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: C.text,
    fontFamily: F.displayBold,
    fontSize: 20,
  },
});
