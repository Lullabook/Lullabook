/**
 * Small Maya's World UI kit for React Native. Import these in screens so each
 * screen stays short and consistent. Pure RN primitives — no extra deps.
 */
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { C, R } from "@/constants/theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <Text style={s.pageTitle}>{children}</Text>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <Text style={s.lead}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Field({ label, ...props }: { label?: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput placeholderTextColor="#B7A992" style={s.input} {...props} />
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.btn, disabled ? s.btnDisabled : s.btnPrimary]}>
      <Text style={[s.btnText, { color: disabled ? C.soft : "#fff" }]}>{title}</Text>
    </Pressable>
  );
}

export function GhostButton({ title, onPress, danger }: { title: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.btn, s.btnGhost, danger && { borderColor: C.dangerBorder }]}>
      <Text style={[s.btnText, { color: danger ? C.danger : C.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, icon, active, onPress }: { label: string; icon?: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, { borderColor: active ? C.primaryLight : C.border, backgroundColor: active ? C.primaryBg : C.surface }]}>
      <Text style={[s.chipText, { color: active ? C.primary : C.muted }]}>{icon ? `${icon}  ` : ""}{label}</Text>
    </Pressable>
  );
}

export function Avatar({ initial, size = 50, color = C.primaryLight }: { initial: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.42 }}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 60, gap: 18 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 1.6, fontSize: 11, fontWeight: "800", color: C.primaryLight, marginBottom: 4 },
  pageTitle: { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  lead: { fontSize: 15, lineHeight: 22, color: C.muted, marginTop: 6 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: R.card, padding: 18, gap: 14 },
  label: { fontWeight: "700", fontSize: 15, color: C.text },
  input: { width: "100%", fontSize: 16, color: C.text, backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: R.input, padding: 13 },
  btn: { borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: C.primary },
  btnGhost: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  btnDisabled: { backgroundColor: "#E7DCCB" },
  btnText: { fontWeight: "800", fontSize: 15 },
  chip: { borderRadius: R.chip, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16 },
  chipText: { fontWeight: "800", fontSize: 14 },
});
