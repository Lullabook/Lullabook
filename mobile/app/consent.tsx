import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Card,
  Eyebrow,
  Field,
  Lead,
  PrimaryButton,
  GhostButton,
  Screen,
  AnimatedCheckbox,
} from "@/components/maya-ui";
import { C, F } from "@/constants/theme";
import { fetchEmailPlusConsentStatus, requestEmailPlusConsent } from "@/lib/api";
import { ConsentFlowController, type ConsentFlowStep } from "@/lib/consent-flow";

/**
 * Issue 173 (ADR-0018) — Email-Plus verified parental consent.
 *
 * Reached from the "Add your baby" step (and from a `consent_required` 403
 * on createBaby, issue 172). The server owns all consent semantics; this
 * screen walks attest+email → "check your email" pending (polls status) →
 * verified. FAIL-4: a failed send is retryable and the Household stays
 * unverified — baby creation remains blocked until the server says otherwise.
 */

const POLL_MS = 4000;

export default function ConsentScreen() {
  const controllerRef = useRef<ConsentFlowController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new ConsentFlowController({
      requestConsent: (email) => requestEmailPlusConsent(email),
      fetchStatus: () => fetchEmailPlusConsentStatus(),
    });
  }
  const controller = controllerRef.current;

  const [step, setStep] = useState<ConsentFlowStep>(controller.state);
  const [attested, setAttested] = useState(false);
  const [email, setEmail] = useState("");
  const [resumed, setResumed] = useState(false);

  useEffect(() => controller.subscribe(setStep), [controller]);

  // Resume: reopening mid-flow lands on the correct step, never a dead end.
  useEffect(() => {
    let alive = true;
    controller.resume().finally(() => {
      if (alive) setResumed(true);
    });
    return () => {
      alive = false;
    };
  }, [controller]);

  // Poll while pending; only a server "verified" advances the flow (SEC-4).
  useEffect(() => {
    if (step.step !== "pending") return;
    const id = setInterval(() => void controller.poll(), POLL_MS);
    return () => clearInterval(id);
  }, [step.step, controller]);

  const busy = step.step === "sending" || !resumed;
  const canSend = attested && email.trim().length > 0 && !busy;

  if (step.step === "verified") {
    return (
      <Screen>
        <View>
          <Eyebrow>💛 Consent confirmed</Eyebrow>
          <Lead>
            Thank you — your consent is verified. You can now add your baby&apos;s
            photos and we&apos;ll start their private likeness.
          </Lead>
        </View>
        <PrimaryButton
          title="Add your baby"
          onPress={() => router.replace("/family/new")}
        />
      </Screen>
    );
  }

  if (step.step === "pending") {
    return (
      <Screen>
        <View>
          <Eyebrow>📬 Check your email</Eyebrow>
          <Lead>
            We sent a confirmation link{step.email ? ` to ${step.email}` : ""}. Open
            it to review what we collect and confirm consent — this screen will
            update on its own once you have.
          </Lead>
        </View>
        <Card>
          <Text style={st.help}>
            The link opens a short page describing exactly what&apos;s collected and
            how to revoke later. Baby photo upload stays locked until you confirm.
          </Text>
        </Card>
        {/* Audit fix (FAIL-2): mistyped email must never be a dead end. */}
        <GhostButton
          title="Re-send or use a different email"
          onPress={() => controller.restart()}
        />
        <GhostButton title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  // attest / sending / send_failed — the form step.
  return (
    <Screen>
      <View>
        <Eyebrow>🛡️ Parental consent</Eyebrow>
        <Lead>
          Before we can train a private likeness from your baby&apos;s photos, we
          need verified parental consent — we&apos;ll email you a confirmation
          link.
        </Lead>
      </View>

      <Card>
        <AnimatedCheckbox
          checked={attested}
          onPress={() => setAttested((v) => !v)}
          label="I am this child's parent or legal Guardian, and I have the authority to consent."
        />
        <Field
          label="Your email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Text style={st.help}>
          We only use this to send your consent link and confirmation — it&apos;s
          never shown to anyone else.
        </Text>
      </Card>

      {step.step === "send_failed" ? (
        <Card>
          <Text style={st.error}>{step.error}</Text>
          <Text style={st.help}>
            Nothing was confirmed — your baby&apos;s profile stays locked until the
            email goes through. Please try again.
          </Text>
        </Card>
      ) : null}

      <PrimaryButton
        title={
          step.step === "sending"
            ? "Sending…"
            : step.step === "send_failed"
              ? "Try again"
              : "Email me the consent link"
        }
        disabled={!canSend}
        onPress={() => void controller.send(email)}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  help: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 19 },
  error: { fontFamily: F.bodyBold, fontSize: 14, color: C.danger, marginBottom: 6 },
});
