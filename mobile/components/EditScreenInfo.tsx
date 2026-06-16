import { StyleSheet, Text, View } from "react-native";

import { ExternalLink } from "./ExternalLink";
import { C, F, R } from "@/constants/theme";

export default function EditScreenInfo({ path }: { path: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.getStartedContainer}>
        <Text style={styles.getStartedText}>Open up the code for this screen:</Text>

        <View style={[styles.codeHighlightContainer, styles.homeScreenFilename]}>
          <Text style={styles.codeText}>{path}</Text>
        </View>

        <Text style={styles.getStartedText}>
          Change any of the text, save the file, and your app will automatically update.
        </Text>
      </View>

      <View style={styles.helpContainer}>
        <ExternalLink
          style={styles.helpLink}
          href="https://docs.expo.io/get-started/create-a-new-app/#opening-the-app-on-your-phonetablet">
          <Text style={styles.helpLinkText}>
            Tap here if your app doesn't automatically update after making changes
          </Text>
        </ExternalLink>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: R.card,
    borderWidth: 1,
    padding: 22,
  },
  getStartedContainer: {
    alignItems: 'center',
    gap: 8,
  },
  homeScreenFilename: {
    marginVertical: 7,
  },
  codeHighlightContainer: {
    backgroundColor: C.surfaceAlt,
    borderColor: C.border,
    borderRadius: R.input,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  getStartedText: {
    color: C.muted,
    fontFamily: F.body,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  codeText: {
    color: C.text,
    fontFamily: "SpaceMono",
    fontSize: 13,
  },
  helpContainer: {
    marginTop: 15,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  helpLink: {
    paddingVertical: 15,
  },
  helpLinkText: {
    color: C.primary,
    fontFamily: F.bodyBold,
    textAlign: 'center',
  },
});
