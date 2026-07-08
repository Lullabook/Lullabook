import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { Card, Eyebrow, Lead, PageTitle } from "@/components/maya-ui";
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Sign up"
      >
        <Card style={styles.card}>
          <View style={styles.hero}>
            <Text style={styles.heroMark}>✨</Text>
          </View>
          <Eyebrow>💛 A story is waiting</Eyebrow>
          <PageTitle>Create your Family</PageTitle>
          <View style={styles.leadWrap}>
            <Lead>
              You&apos;ll be the Guardian — the grown-up in charge of family members and privacy. Sign
              up with Apple or Google and we&apos;ll set up your family&apos;s private story world
              automatically.
            </Lead>
          </View>

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.buttonStack}>
            {appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={R.pill}
                style={styles.appleButton}
                onPress={signUpWithApple}
              />
            ) : Platform.OS === "ios" || Platform.OS === "web" ? null : (
              // Web: expo-apple-authentication has no implementation — the
              // fallback tap would throw UnavailabilityError. Inert, not a dead
              // button (same doctrine as r1-flags). iOS keeps its existing null.
              <Pressable
                style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
                onPress={signUpWithApple}
                disabled={loading !== null}
                accessibilityRole="button"
                accessibilityLabel="Continue with Apple"
              >
                <Text style={styles.buttonText}>{loading === "apple" ? "…" : " Continue with Apple"}</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [styles.googleButton, pressed && { opacity: 0.85 }]}
              onPress={signUpWithGoogle}
              disabled={loading !== null}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              {loading === "google" ? (
                <ActivityIndicator color={C.text} />
              ) : (
                <Text style={styles.googleText}>Continue with Google</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.divider} />

          <Text style={styles.footerText}>
            Already have an account?{" "}
            <Link href="/sign-in" style={styles.footerLink}>
              Sign in
            </Link>
          </Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 440, alignSelf: "center", padding: 28, gap: 0 },
  hero: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: R.card,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#E79A3C",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  heroMark: { fontSize: 30 },
  leadWrap: { marginTop: 6, marginBottom: 18 },
  errorBanner: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: C.dangerBg,
    borderWidth: 1,
    borderColor: C.dangerBorder,
    marginBottom: 16,
  },
  errorText: { color: C.danger, fontFamily: F.bodySemi, fontSize: 14, lineHeight: 20 },
  buttonStack: { gap: 12 },
  button: {
    backgroundColor: C.text,
    borderRadius: R.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: C.surface, fontSize: 16, fontFamily: F.bodyBold },
  appleButton: { width: "100%", height: 50 },
  googleButton: {
    backgroundColor: C.bg,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 16,
    alignItems: "center",
  },
  googleText: { color: C.text, fontSize: 16, fontFamily: F.bodyBold },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 20 },
  footerText: { fontSize: 14, color: C.muted, fontFamily: F.body, lineHeight: 20 },
  footerLink: { color: C.primary, fontFamily: F.bodyBold },
});
