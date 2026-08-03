import { Image, Text, View, type ViewStyle } from "react-native";
import { BrandGradient } from "@/components/maya-ui";
import { C, F } from "@/constants/theme";
import { getApiUrl } from "@/lib/env";
import { getAccessToken } from "@/lib/supabase";
import { useEffect, useState } from "react";
import type { PersonaStatus } from "@domain/types";

// Canonical AVATAR_GRADIENTS (src/components/v2/tokens.ts) — all five cast
// accents, so each person keeps a consistent color across every surface.
const GRADIENTS: [string, string][] = [
  ["#8B6DF0", "#6A55C9"],
  ["#E79A3C", "#F6C177"],
  ["#E78AA0", "#F2A6B8"],
  ["#5FB389", "#9FD8B1"],
  ["#3f9bb0", "#7fc8c0"],
];

function avatarUrl(avatarKey: string): string {
  return `${getApiUrl()}/api/avatars?key=${encodeURIComponent(avatarKey)}`;
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
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "ready" || !avatarKey) return;
    getAccessToken().then(setToken).catch(() => setToken(null));
  }, [avatarKey, status]);
  const showImage = status === "ready" && !!avatarKey && !!token;
  const gradient = GRADIENTS[(initial.charCodeAt(0) || 0) % GRADIENTS.length]!;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        },
        style,
      ]}
      accessibilityLabel={`${name} avatar`}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl(avatarKey), headers: { Authorization: `Bearer ${token}` } }}
          style={{ width: size, height: size }}
          accessibilityLabel={`${name} roster avatar`}
          alt={`${name} roster avatar`}
          onError={() => setToken(null)}
        />
      ) : (
        <BrandGradient
          colors={gradient}
          style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: C.surface, fontFamily: F.displayBold, fontSize: size * 0.42 }}>{initial.toUpperCase()}</Text>
        </BrandGradient>
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
          <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: i < count ? C.greenText : C.soft }}>
            {i < count ? `✓ Photo ${i + 1}` : `Photo ${i + 1}`}
          </Text>
        </View>
      ))}
      <Text style={{ color: C.muted, fontFamily: F.body, fontSize: 13, alignSelf: "center" }}>
        {enough ? `${count} selected — ready` : `${count} of 3 minimum`}
      </Text>
    </View>
  );
}
