import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { Eyebrow, Field, PageTitle, Lead } from "@/components/maya-ui";
import { C, R } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/(tabs)");
    });
  }, []);

  async function signIn() {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/(tabs)");
  }

  async function signInWithApple() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("No identity token");
      const { error: err } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (err) throw err;
      router.replace("/(tabs)");
    } catch (e) {
      if ((e as { code?: string }).code !== "ERR_REQUEST_CANCELED") {
        setError(e instanceof Error ? e.message : "Apple sign-in failed");
      }
    }
  }

  return (
    <View style={styles.container} accessibilityLabel="Sign in">
      <View style={styles.hero}>
        <Text style={styles.heroMark}>🌙</Text>
      </View>
      <Eyebrow>💛 Welcome back</Eyebrow>
      <PageTitle>Welcome to Lullabook</PageTitle>
      <Lead>Sign in to make a bedtime story starring your family.</Lead>

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
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={signIn} disabled={loading} accessibilityRole="button">
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={R.pill}
          style={styles.appleButton}
          onPress={signInWithApple}
        />
        <Link href="/sign-up" style={styles.link}>
          Create an account
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
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: "#6A55C9",
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
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  appleButton: { width: "100%", height: 50, marginTop: 2 },
  link: { marginTop: 16, textAlign: "center", color: C.primary, fontSize: 15, fontWeight: "800" },
  error: { color: C.danger, fontWeight: "700" },
});
