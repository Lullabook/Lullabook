import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { Eyebrow, Field, Lead } from "@/components/maya-ui";
import { C, F, R } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL ?? "";
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD ?? "";
const DEV_SIGNIN_ENABLED = __DEV__ && !!DEV_EMAIL && !!DEV_PASSWORD;

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

export default function SignInScreen() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"apple" | "google" | "dev" | "email" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/(tabs)");
    });
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  async function afterAuth() {
    router.replace("/(tabs)");
  }

  async function signInWithEmail() {
    setLoading("email");
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      await afterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email sign-in failed");
    } finally {
      setLoading(null);
    }
  }

  async function signInWithApple() {
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
      await afterAuth();
    } catch (e) {
      if ((e as { code?: string }).code !== "ERR_REQUEST_CANCELED") {
        setError(e instanceof Error ? e.message : "Apple sign-in failed");
      }
    } finally {
      setLoading(null);
    }
  }

  async function signInWithGoogle() {
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
        await afterAuth();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Google sign-in failed";
      if (message.includes("provider is not enabled")) {
        // Dev-only detail; a parent just needs a warm nudge to the working path.
        setError(
          __DEV__
            ? "Google is not enabled in Supabase yet. Use Apple or the simulator email sign-in below."
            : "Google sign-in isn't available right now — Apple sign-in works!"
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(null);
    }
  }

  async function devQuickSignIn() {
    if (!DEV_SIGNIN_ENABLED) return;
    setEmail(DEV_EMAIL);
    setPassword(DEV_PASSWORD);
    setLoading("dev");
    setError(null);
    try {
      let { error: err } = await supabase.auth.signInWithPassword({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (err?.message?.includes("Invalid login credentials")) {
        const created = await supabase.auth.signUp({
          email: DEV_EMAIL,
          password: DEV_PASSWORD,
          options: { data: { jurisdiction: "US_IOS" } },
        });
        err = created.error;
        if (!err && created.data.session) {
          await afterAuth();
          return;
        }
        if (!err) {
          const retry = await supabase.auth.signInWithPassword({
            email: DEV_EMAIL,
            password: DEV_PASSWORD,
          });
          err = retry.error;
        }
      }
      if (err) throw err;
      await afterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dev sign-in failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.container} accessibilityLabel="Sign in">
      <View style={styles.hero}>
        <Text style={styles.heroMark}>🌙</Text>
      </View>
      <Text style={styles.wordmark}>Lullabook</Text>
      <Eyebrow>💛 Welcome back</Eyebrow>
      <Lead>Sign in with Apple or Google to make bedtime Storybooks starring your family.</Lead>

      <View style={styles.form}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={R.pill}
            style={styles.appleButton}
            onPress={signInWithApple}
          />
        ) : Platform.OS === "web" ? null : (
          // expo-apple-authentication has no web implementation — on the
          // expo-web dev preview this fallback would be a dead button whose
          // tap throws UnavailabilityError. Render nothing there instead;
          // Google + the dev email path remain. iOS behavior unchanged.
          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
            onPress={signInWithApple}
            disabled={loading !== null}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            <Text style={styles.buttonText}>
              {loading === "apple" ? "…" : " Continue with Apple"}
            </Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && { opacity: 0.85 }]}
          onPress={signInWithGoogle}
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

        <Link href="/sign-up" style={styles.link}>
          New here? Create your family&apos;s world
        </Link>

        {DEV_SIGNIN_ENABLED ? (
          <View style={styles.devBlock}>
            <Text style={styles.devLabel}>Simulator dev sign-in</Text>
            <Field
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
            <Pressable style={styles.devButton} onPress={signInWithEmail} disabled={loading !== null}>
              <Text style={styles.devButtonText}>
                {loading === "email" ? "Signing in…" : "Sign in with email"}
              </Text>
            </Pressable>
            <Pressable style={styles.devQuick} onPress={devQuickSignIn} disabled={loading !== null}>
              <Text style={styles.devQuickText}>
                {loading === "dev" ? "…" : "⚡ One-tap simulator account"}
              </Text>
            </Pressable>
          </View>
        ) : null}
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
  wordmark: {
    alignSelf: "center",
    fontFamily: F.display,
    fontSize: 30,
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  form: { marginTop: 18, gap: 14 },
  link: { marginTop: 12, textAlign: "center", color: C.primary, fontSize: 15, fontFamily: F.bodyBold, paddingVertical: 12 },
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
  devBlock: {
    marginTop: 8,
    gap: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  devLabel: { fontFamily: F.bodyBold, fontSize: 13, color: C.muted },
  devButton: {
    backgroundColor: C.primary,
    borderRadius: R.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  devButtonText: { color: C.surface, fontFamily: F.bodyBold, fontSize: 15 },
  devQuick: { alignItems: "center", paddingVertical: 6 },
  devQuickText: { color: C.primary, fontFamily: F.bodyBold, fontSize: 14 },
  error: { color: C.danger, fontFamily: F.bodyBold },
});
