import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAudio } from "@/lib/audio";
import { BrandGradient, Screen, Eyebrow, Lead, Card, PrimaryButton, GhostButton, SkeletonCard, SkeletonRow } from "@/components/maya-ui";
import { RosterAvatar } from "@/components/roster-avatar";
import { fetchHome, listVoiceClips, uploadVoiceClip, type HomeResponse } from "@/lib/api";
import { isR1AudioEnabled, R1_CUT_MESSAGE } from "@/lib/r1-flags";
import { C, F, R } from "@/constants/theme";
import type { PersonaStatus } from "@domain/types";

/** Parent-facing likeness-training labels — raw enums never reach the screen. */
const STATUS_LABEL: Record<PersonaStatus, string> = {
  training: "✨ Learning their look…",
  review: "👀 Reviewing their likeness",
  ready: "Ready to star in stories",
  failed: "Training needs a retry",
};

interface VoiceClipWire {
  id: string;
  label: string;
  transcript: string;
  durationSecs: number;
}

/**
 * Header-band gradient pairs (mirrors web's HEADER_GRADIENTS in
 * src/lib/v2-theme.ts). Picked by the same char-code hash roster-avatar.tsx
 * uses for the avatar gradient, so a person's detail-screen header always
 * pairs with the color they show up as everywhere else.
 */
const HEADER_GRADIENTS: [string, string][] = [
  ["#8B6DF0", "#6A55C9"],
  ["#E79A3C", "#F0A878"],
  ["#E78AA0", "#C77FA6"],
  ["#5FB389", "#7FC8A0"],
  ["#3f9bb0", "#5fb3c0"],
];
function headerGradientFor(initial: string): [string, string] {
  const idx = (initial.charCodeAt(0) || 0) % HEADER_GRADIENTS.length;
  return HEADER_GRADIENTS[idx]!;
}

const KIND_LABEL: Record<"baby" | "adult", string> = {
  baby: "👶 Baby",
  adult: "🧑 Family member",
};

export default function FamilyMemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personaId = Array.isArray(id) ? id[0] : id;

  const [home, setHome] = useState<HomeResponse | null>(null);
  const [clips, setClips] = useState<VoiceClipWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioPerm, setAudioPerm] = useState<boolean | null>(null);

  const persona = home?.personas.find((p) => p.id === personaId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHome();
      setHome(data);
      if (personaId) {
        const clipRes = await listVoiceClips(personaId);
        setClips(clipRes.clips);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (msg.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Issue 145 — audio is cut from R1: never prompt for microphone access on
    // behalf of a feature that isn't reachable (App Review + parent trust).
    if (!isR1AudioEnabled()) {
      setAudioPerm(false);
      return;
    }
    (async () => {
      const Audio = getAudio();
      if (!Audio) {
        setAudioPerm(false);
        return;
      }
      try {
        const status = await Audio.requestPermissionsAsync();
        setAudioPerm(status.granted);
      } catch {
        setAudioPerm(false);
      }
    })();
  }, []);

  async function startRecording() {
    setError(null);
    const Audio = getAudio();
    if (!Audio) {
      setError("Voice recording needs a dev build — it isn't available in Expo Go.");
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      (recordingRef as { current: import("expo-av").Audio.Recording | null }).current = rec;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recording");
    }
  }

  async function stopRecording() {
    try {
      const rec = recordingRef.current;
      if (!rec) return;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecordedUri(uri);
      setRecording(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop recording");
      setRecording(false);
    }
  }

  async function attachClip() {
    if (!recordedUri || !personaId || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Read the audio file as base64
      const response = await fetch(recordedUri);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await uploadVoiceClip({
        personaId,
        label: label.trim() || "Voice message",
        transcript: transcript.trim() || "Voice message",
        durationSecs: 5,
        audioBytes: base64,
      });
      setLabel("");
      setTranscript("");
      setRecordedUri(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload voice clip");
    } finally {
      setBusy(false);
    }
  }

  const recordingRef = { current: null as import("expo-av").Audio.Recording | null };

  if (loading && home === null) {
    return (
      <Screen>
        <SkeletonRow />
        <SkeletonCard lines={2} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Eyebrow>💛 Family member</Eyebrow>

      {persona ? (
        <BrandGradient
          colors={headerGradientFor(persona.displayName.charAt(0))}
          fallback={C.primary}
          style={st.heroBand}
        >
          <View style={st.heroRing}>
            <RosterAvatar
              name={persona.displayName}
              initial={persona.displayName.charAt(0)}
              status={persona.status}
              avatarKey={persona.avatarKey}
              size={78}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroName}>{persona.displayName}</Text>
            <View style={st.heroBadgeRow}>
              <View style={st.heroBadgeGhost}>
                <Text style={st.heroBadgeGhostText}>{KIND_LABEL[persona.kind]}</Text>
              </View>
              <View style={st.heroBadgeSolid}>
                <Text style={st.heroBadgeSolidText}>{STATUS_LABEL[persona.status] ?? persona.status}</Text>
              </View>
            </View>
          </View>
        </BrandGradient>
      ) : null}

      <Lead>
        {isR1AudioEnabled()
          ? "Record a voice message for stories. The recorder self-consents to their own voice."
          : `Part of the cast — drawn as themselves in every story they star in.`}
      </Lead>

      {error ? (
        <Card style={st.errorCard}><Text style={st.errorText}>{error}</Text></Card>
      ) : null}

      {/* Issue 145 — audio cut from R1. The voice recorder + clips UI is gated
          off (no reachable record/play UI). Code kept behind the flag for R2. */}
      {!isR1AudioEnabled() ? (
        <Card>
          <Text style={st.cardTitle}>🎤 Voice messages</Text>
          <Text style={st.copy}>Recording voice messages {R1_CUT_MESSAGE} — it&apos;s coming back soon.</Text>
        </Card>
      ) : audioPerm === false ? (
        <Card>
          <Text style={st.cardTitle}>🎤 Microphone access needed</Text>
          <Text style={st.copy}>Grant microphone access in Settings to record voice messages.</Text>
        </Card>
      ) : (
        <Card>
          <Text style={st.cardTitle}>🎤 Record a voice message</Text>
          <Text style={st.copy}>The recorder self-consents to their own voice — clips post immediately.</Text>

          {!recordedUri ? (
            <PrimaryButton
              title={recording ? "⏹ Stop recording" : "🎤 Start recording"}
              onPress={recording ? stopRecording : startRecording}
            />
          ) : (
            <>
              <Text style={st.ready}>✓ Recorded — add a label and transcript</Text>
              <TextInput
                style={st.input}
                placeholder="Label (e.g. 'Goodnight message')"
                placeholderTextColor="#B7A992"
                value={label}
                onChangeText={setLabel}
              />
              <TextInput
                style={st.input}
                placeholder="Transcript (what they say)"
                placeholderTextColor="#B7A992"
                value={transcript}
                onChangeText={setTranscript}
                multiline
              />
              <View style={st.row}>
                <GhostButton title="↻ Re-record" onPress={() => setRecordedUri(null)} />
                <PrimaryButton title={busy ? "Attaching…" : "✓ Attach"} onPress={attachClip} disabled={busy} />
              </View>
            </>
          )}
        </Card>
      )}

      {/* Existing clips — only shown when audio is enabled (R2). */}
      {isR1AudioEnabled() ? (
        <Card>
          <Text style={st.cardTitle}>📋 Voice clips ({clips.length})</Text>
          {clips.length === 0 ? (
            <Text style={st.copy}>No voice clips yet.</Text>
          ) : (
            clips.map((c) => (
              <View key={c.id} style={st.clipRow}>
                <Text style={st.clipLabel}>{c.label}</Text>
                <Text style={st.clipMeta}>{c.transcript} · {c.durationSecs}s</Text>
              </View>
            ))
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  cardTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
  heroBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: R.detail,
    padding: 22,
    shadowColor: "#3A2850",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroRing: {
    borderRadius: 43,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.55)",
  },
  heroName: { fontFamily: F.display, fontSize: 24, color: "#fff", letterSpacing: -0.3 },
  heroBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  heroBadgeGhost: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.25)" },
  heroBadgeGhostText: { fontFamily: F.bodyBold, fontSize: 12, color: "#fff" },
  heroBadgeSolid: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.95)" },
  heroBadgeSolidText: { fontFamily: F.bodyBold, fontSize: 12, color: C.accentDark },
  copy: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 4 },
  ready: { fontFamily: F.bodyBold, fontSize: 14, color: C.greenText, marginTop: 10 },
  input: {
    minHeight: 44,
    fontFamily: F.body,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.input,
    padding: 12,
    marginTop: 8,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 10 },
  clipRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  clipLabel: { fontFamily: F.bodyBold, fontSize: 15, color: C.text },
  clipMeta: { fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 2 },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
