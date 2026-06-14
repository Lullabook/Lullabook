import { Image, Text, View, type ViewStyle } from "react-native";
import { C } from "@/constants/theme";
import type { PersonaStatus } from "@domain/types";

const GRADIENTS = [
  ["#8B6DF0", "#6A55C9"],
  ["#E79A3C", "#F6C177"],
  ["#E78AA0", "#F2A6B8"],
  ["#5FB389", "#9FD8B1"],
] as const;

function avatarUrl(avatarKey: string): string {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  return `${base}/api/avatars?key=${encodeURIComponent(avatarKey)}`;
}

export function RosterAvatar({
  name,
  initial,
  status,
  avatarKey,
  size = 48,
  style,
}: {
  name: string;
  initial: string;
  status: PersonaStatus;
  avatarKey?: string | null;
  size?: number;
  style?: ViewStyle;
}) {
  const showImage = status === "ready" && !!avatarKey;
  const gradient = GRADIENTS[(initial.charCodeAt(0) || 0) % GRADIENTS.length]!;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: gradient[0],
        },
        style,
      ]}
      accessibilityLabel={`${name} avatar`}
    >
      {showImage ? (
        <Image source={{ uri: avatarUrl(avatarKey) }} style={{ width: size, height: size }} accessibilityLabel={`${name} roster avatar`} />
      ) : (
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.42 }}>{initial.toUpperCase()}</Text>
      )}
    </View>
  );
}

export function PhotoUploadStatus({ count, enough }: { count: number; enough: boolean }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {Array.from({ length: Math.max(count, 3) }).map((_, i) => (
        <View
          key={i}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: i < count ? C.greenBg : C.surfaceAlt,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 12, color: i < count ? C.greenText : C.soft }}>
            {i < count ? `✓ Photo ${i + 1}` : `Photo ${i + 1}`}
          </Text>
        </View>
      ))}
      <Text style={{ color: C.muted, fontSize: 13, alignSelf: "center" }}>
        {enough ? `${count} selected — ready` : `${count} of 3 minimum`}
      </Text>
    </View>
  );
}
