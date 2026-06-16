import { Link, Stack } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Screen, Card, Eyebrow, PageTitle, Lead } from "@/components/maya-ui";
import { C, F } from "@/constants/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <Screen>
        <Eyebrow>☀️ Lullabook</Eyebrow>
        <PageTitle>This page wandered off</PageTitle>
        <Lead>The route is not ready yet, but your family world is safe.</Lead>

        <Card>
          <Text style={styles.title}>Try the main tabs again.</Text>
          <Link href="/" style={styles.link}>
            Back to Home
          </Link>
        </Card>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: F.displayBold,
    fontSize: 20,
    color: C.text,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    color: C.primary,
    fontFamily: F.bodyBold,
    fontSize: 15,
  },
});
