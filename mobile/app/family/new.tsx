import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Screen, Eyebrow, PageTitle, Lead, Card, Field, Chip, PrimaryButton } from "@/components/maya-ui";
import { PhotoUploadStatus, RosterAvatar } from "@/components/roster-avatar";
import { C } from "@/constants/theme";

export default function AddFamilyScreen() {
  const [kind, setKind] = useState<"adult" | "baby">("adult");
  const [name, setName] = useState("");
  const [rel, setRel] = useState("");
  const [babyCalls, setBabyCalls] = useState("");
  const [theyCall, setTheyCall] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  async function pickPhotos() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.9, selectionLimit: 10 });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)]);
  }
  async function takeSelfie() {
    const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.9 });
    if (!res.canceled) setSelfie(res.assets[0].uri);
  }

  const enough = photos.length >= 3;
  const showSelfie = kind === "adult";
  const ready = enough && consent && (!showSelfie || !!selfie) && name.trim().length > 0;
  const previewInitial = (name.trim()[0] || "?").toUpperCase();

  function submit() {
    if (!ready) return;
    router.replace("/(tabs)");
  }

  return (
    <Screen>
      <View>
        <Eyebrow>💛 Add to the family</Eyebrow>
        <PageTitle>Add someone who loves them</PageTitle>
        <Lead>Add their photos and we&apos;ll train a private likeness so they&apos;re drawn as themselves in every story. Photos stay encrypted and are never shown back — only the generated roster avatar appears.</Lead>
      </View>

      <View style={st.preview}>
        <RosterAvatar name={name.trim() || "New member"} initial={previewInitial} status="training" size={60} />
        <View style={{ flex: 1 }}>
          <Text style={st.previewName}>{name.trim() || "New member"}</Text>
          <View style={st.previewPill}><Text style={st.previewPillText}>{(rel.trim() || "Relationship")} to the baby</Text></View>
          <View style={st.previewStatusRow}>
            <View style={[st.dot, { backgroundColor: enough ? C.green : "#C9A9A9" }]} />
            <Text style={st.previewStatus}>{enough ? "Ready to train likeness" : "Needs photos"}</Text>
          </View>
        </View>
      </View>

      <Card>
        <Text style={st.h}>Who is this?</Text>
        <View style={st.chipRow}>
          <Chip icon="🧑" label="An adult" active={kind === "adult"} onPress={() => setKind("adult")} />
          <Chip icon="👶" label="The baby" active={kind === "baby"} onPress={() => setKind("baby")} />
        </View>
      </Card>

      <Card>
        <Field label="Their name" placeholder="Nadia" value={name} onChangeText={setName} />
        <Field label="Their relationship to the baby" placeholder="Grandma" value={rel} onChangeText={setRel} />
        <Field label="What the baby calls them" placeholder="Nani" value={babyCalls} onChangeText={setBabyCalls} />
        <Field label="What they call the baby" placeholder="moonbeam" value={theyCall} onChangeText={setTheyCall} />
      </Card>

      <Card>
        <View style={st.rowBetween}>
          <Text style={st.h}>📸 Their photos</Text>
          <View style={[st.countPill, { backgroundColor: enough ? C.greenBg : C.badgeGold }]}>
            <Text style={[st.countText, { color: enough ? C.greenText : C.badgeGoldText }]}>{photos.length === 0 ? "No photos yet" : enough ? `✓ ${photos.length} — ready` : `${photos.length} of 3`}</Text>
          </View>
        </View>
        <Text style={st.help}>At least 3 clear, well-lit photos of just this person. We never display them back.</Text>
        <Pressable onPress={pickPhotos} style={st.dropzone}>
          <Text style={{ fontSize: 30 }}>⬆️</Text>
          <Text style={st.dropTitle}>Tap to add photos</Text>
          <Text style={st.help}>JPG or PNG · up to 10</Text>
        </Pressable>
        {photos.length > 0 ? <PhotoUploadStatus count={photos.length} enough={enough} /> : null}
      </Card>

      {showSelfie && (
        <Card>
          <Text style={st.h}>🤳 A selfie, taken now</Text>
          <Text style={st.help}>For an adult&apos;s own likeness we ask for one fresh selfie — it&apos;s how we confirm consent. The selfie is never displayed.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={[st.selfieFrame, selfie ? { borderColor: C.green, backgroundColor: C.greenBg } : null]}>
              <Text style={{ fontSize: 22 }}>{selfie ? "✓" : "🤳"}</Text>
            </View>
            <Pressable onPress={takeSelfie} style={st.selfieBtn}><Text style={st.selfieBtnText}>{selfie ? "↻ Retake selfie" : "🤳 Take a selfie"}</Text></Pressable>
          </View>
        </Card>
      )}

      <Card>
        <Pressable onPress={() => setConsent((v) => !v)} style={st.consentRow}>
          <View style={[st.checkbox, { backgroundColor: consent ? C.primary : "#fff", borderColor: consent ? C.primary : C.borderDashed }]}>{consent ? <Text style={st.checkmark}>✓</Text> : null}</View>
          <Text style={st.consentText}>
            {kind === "baby"
              ? "I am this child's Guardian. I consent to training a private likeness model from these photos."
              : "These photos are of me. I consent to training a private likeness model of myself."}
          </Text>
        </Pressable>
        <PrimaryButton title={ready ? "✨ Start training (~5 min)" : enough ? "Confirm consent to continue" : `Add ${Math.max(0, 3 - photos.length)} more photo(s)`} disabled={!ready} onPress={submit} />
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  h: { fontWeight: "800", fontSize: 17, color: C.text },
  help: { color: C.soft, fontSize: 13, lineHeight: 19 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  preview: { flexDirection: "row", gap: 14, alignItems: "center", backgroundColor: C.primary, borderRadius: 24, padding: 18 },
  previewName: { color: "#fff", fontWeight: "800", fontSize: 18 },
  previewPill: { alignSelf: "flex-start", marginTop: 4, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  previewPillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  previewStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  previewStatus: { color: "#FBEAF3", fontWeight: "700", fontSize: 13 },
  countPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  countText: { fontWeight: "800", fontSize: 12 },
  dropzone: { alignItems: "center", justifyContent: "center", gap: 6, padding: 26, borderRadius: 18, borderWidth: 2, borderColor: C.borderDashed, borderStyle: "dashed", backgroundColor: C.surfaceAlt },
  dropTitle: { fontWeight: "800", fontSize: 16, color: C.primary },
  selfieFrame: { width: 64, height: 64, borderRadius: 16, backgroundColor: C.bg, borderWidth: 2, borderColor: C.borderDashed, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  selfieBtn: { borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 18, paddingVertical: 12 },
  selfieBtnText: { color: C.primary, fontWeight: "800", fontSize: 14 },
  consentRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkmark: { color: "#fff", fontWeight: "800", fontSize: 13 },
  consentText: { flex: 1, color: C.muted, fontSize: 14, lineHeight: 20 },
});
