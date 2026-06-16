import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Eyebrow, Field, PageTitle, Lead } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signUp() {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { jurisdiction: "US_IOS" } },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container} accessibilityLabel="Sign up">
      <View style={styles.hero}>
        <Text style={styles.heroMark}>✨</Text>
      </View>
      <Eyebrow>💛 New here</Eyebrow>
      <PageTitle>Create your Family</PageTitle>
      <Lead>Start free with text-only stories — no photos, no subscription needed.</Lead>

      <View style={styles.form}>
        <Field
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Password"
          secureTextEntry
          placeholder="Choose a password"
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={signUp} disabled={loading} accessibilityRole="button">
          {loading ? <ActivityIndicator color={C.surface} /> : <Text style={styles.buttonText}>Sign up</Text>}
        </Pressable>
        <Link href="/sign-in" style={styles.link}>
          I already have an account
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: C.bg, gap: 6 },
  hero: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: "#E79A3C",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  heroMark: { fontSize: 36 },
  form: { marginTop: 18, gap: 14 },
  button: {
    backgroundColor: C.primary,
    borderRadius: R.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: C.surface, fontSize: 16, fontFamily: F.bodyBold },
  link: { marginTop: 16, textAlign: "center", color: C.primary, fontSize: 15, fontFamily: F.bodyBold },
  error: { color: C.danger, fontFamily: F.bodyBold },
});
