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
import { SafeAreaView } from "react-native-safe-area-context";
import { C, F, R } from "@/constants/theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.screen}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
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
      <Text style={[s.btnText, { color: disabled ? C.soft : C.surface }]}>{title}</Text>
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
      <Text style={{ color: C.surface, fontFamily: F.displayBold, fontSize: size * 0.42 }}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, backgroundColor: C.bg },
  screen: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 112, gap: 22 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 1.6, fontSize: 11, fontFamily: F.bodyBold, color: C.primaryLight, marginBottom: 4 },
  pageTitle: { fontSize: 32, fontFamily: F.display, color: C.text, letterSpacing: -0.5, lineHeight: 38 },
  lead: { fontSize: 16, lineHeight: 24, color: C.muted, marginTop: 6, fontFamily: F.body },
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.card,
    padding: 22,
    gap: 14,
    shadowColor: "#3A2850",
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  label: { fontFamily: F.displayBold, fontSize: 16, color: C.text },
  input: { width: "100%", fontSize: 16, color: C.text, backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: R.input, padding: 13, fontFamily: F.body },
  btn: { minHeight: 48, borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  btnPrimary: {
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  btnGhost: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  btnDisabled: { backgroundColor: "#E7DCCB" },
  btnText: { fontFamily: F.bodyBold, fontSize: 15 },
  chip: { minHeight: 44, borderRadius: R.chip, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16, justifyContent: "center" },
  chipText: { fontFamily: F.bodyBold, fontSize: 14 },
});
