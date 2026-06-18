import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { Eyebrow, PageTitle, Lead } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) {
    throw new Error("No session tokens returned");
  }
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}

export default function SignUpScreen() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"apple" | "google" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  async function signUpWithApple() {
    setLoading("apple");
    setError(null);
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
        setError(e instanceof Error ? e.message : "Apple sign-up failed");
      }
    } finally {
      setLoading(null);
    }
  }

  async function signUpWithGoogle() {
    setLoading("google");
    setError(null);
    try {
      const redirectTo = makeRedirectUri({ scheme: "com.lullabook" });
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error("No OAuth URL");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        await createSessionFromUrl(result.url);
        router.replace("/(tabs)");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-up failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.container} accessibilityLabel="Sign up">
      <View style={styles.hero}>
        <Text style={styles.heroMark}>✨</Text>
      </View>
      <Eyebrow>💛 New here</Eyebrow>
      <PageTitle>Create your Family</PageTitle>
      <Lead>Sign up with Apple or Google — your first Member and Family are created automatically.</Lead>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={R.pill}
            style={styles.appleButton}
            onPress={signUpWithApple}
          />
        ) : Platform.OS === "ios" ? null : (
          <Pressable style={styles.button} onPress={signUpWithApple} disabled={loading !== null}>
            <Text style={styles.buttonText}>{loading === "apple" ? "…" : " Continue with Apple"}</Text>
          </Pressable>
        )}

        <Pressable style={styles.googleButton} onPress={signUpWithGoogle} disabled={loading !== null}>
          {loading === "google" ? (
            <ActivityIndicator color={C.text} />
          ) : (
            <Text style={styles.googleText}>Continue with Google</Text>
          )}
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
    backgroundColor: C.text,
    borderRadius: R.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: C.surface, fontSize: 16, fontFamily: F.bodyBold },
  appleButton: { width: "100%", height: 50 },
  googleButton: {
    backgroundColor: C.surface,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 16,
    alignItems: "center",
  },
  googleText: { color: C.text, fontSize: 16, fontFamily: F.bodyBold },
  link: { marginTop: 16, textAlign: "center", color: C.primary, fontSize: 15, fontFamily: F.bodyBold },
  error: { color: C.danger, fontFamily: F.bodyBold },
});
