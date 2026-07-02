import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAudio } from "@/lib/audio";
import { Screen, Eyebrow, PageTitle, Lead, Card, PrimaryButton, GhostButton } from "@/components/maya-ui";
import { BackPill } from "@/components/BackPill";
import { fetchHome, listVoiceClips, uploadVoiceClip, type HomeResponse } from "@/lib/api";
import { isR1AudioEnabled, R1_CUT_MESSAGE } from "@/lib/r1-flags";
import { C, F, R } from "@/constants/theme";

interface VoiceClipWire {
  id: string;
  label: string;
  transcript: string;
  durationSecs: number;
}

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

  if (loading) {
    return <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  return (
    <Screen>
      <View>
        <Eyebrow>💛 Family member</Eyebrow>
        <PageTitle>{persona?.displayName ?? "Member"}</PageTitle>
        <Lead>Record a voice message for stories. The recorder self-consents to their own voice.</Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}><Text style={st.errorText}>{error}</Text></Card>
      ) : null}

      {/* Issue 145 — audio cut from R1. The voice recorder + clips UI is gated
          off (no reachable record/play UI). Code kept behind the flag for R2. */}
      {!isR1AudioEnabled() ? (
        <Card>
          <Text style={st.cardTitle}>🎤 Voice messages</Text>
          <Text style={st.copy}>Voice messages {R1_CUT_MESSAGE}.</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  cardTitle: { fontFamily: F.displayBold, fontSize: 18, color: C.text },
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
