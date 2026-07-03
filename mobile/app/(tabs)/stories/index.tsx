import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import {
  Screen,
  Eyebrow,
  PageTitle,
  Lead,
  Card,
  BrandGradient,
  PrimaryButton,
  SkeletonRow,
  EmptyState,
  ListScreen,
  InsetSeparator,
} from "@/components/maya-ui";
import { usePressFeedback } from "@/lib/use-press-feedback";
import { listStorybooks, type StorybookSummary } from "@/lib/api";
import { C, F } from "@/constants/theme";

const AnimatedPressable = createAnimatedComponent(Pressable);

function statusLabel(status: StorybookSummary["status"]): string {
  switch (status) {
    case "generating":
      return "✨ Illustrating…";
    case "draft":
      return "📖 Ready to read";
    case "finalized":
      return "🌟 Finalized";
    case "failed":
      return "🌦 Needs attention";
    default:
      return status;
  }
}

/** Parent-facing story-type labels — raw enums never reach the screen. */
const TYPE_LABEL: Record<string, string> = {
  bedtime: "Bedtime",
  adventure: "Adventure",
  silly: "Silly",
  learning: "Learning",
};

// Book-cover skies (canon §1.3 bookSky) — two-stop dusk gradients assigned by
// title so each book keeps a consistent cover.
const BOOK_SKIES: [string, string][] = [
  ["#4a7f5a", "#e8c46a"],
  ["#5b8fb0", "#cfe6f0"],
  ["#2f9bb0", "#f6d9a0"],
  ["#7a3f6e", "#f2a6b8"],
  ["#3b2f6e", "#6a55c9"],
  ["#8a5a86", "#f6b98c"],
];

function BookRow({ book }: { book: StorybookSummary }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  const sky = BOOK_SKIES[(book.theme.charCodeAt(0) || 0) % BOOK_SKIES.length]!;
  return (
    <AnimatedPressable
      onPress={() => router.push(`/stories/${book.id}` as never)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Open ${book.theme}`}
      style={[st.row, style]}
    >
      <BrandGradient colors={sky} fallback={C.primaryBg} style={st.cover}>
        <Text style={st.coverEmoji}>📖</Text>
      </BrandGradient>
      <View style={{ flex: 1 }}>
        <Text style={st.title}>{book.theme}</Text>
        <Text style={st.meta}>{statusLabel(book.status)} · {TYPE_LABEL[book.storyType] ?? "Story"}</Text>
      </View>
      <Text style={st.chev}>›</Text>
    </AnimatedPressable>
  );
}

export default function StorybookLibraryScreen() {
  const [books, setBooks] = useState<StorybookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listStorybooks();
      setBooks(data.storybooks);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load Storybooks";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </Screen>
    );
  }

  return (
    <ListScreen
      data={books}
      keyExtractor={(book) => book.id}
      renderItem={({ item: book }) => <BookRow book={book} />}
      ListHeaderComponent={
        <>
          <View>
            <Eyebrow>📚 Library</Eyebrow>
            <PageTitle>Your Storybooks</PageTitle>
            <Lead>Illustrated books you&apos;ve generated — tap to read or watch them finish.</Lead>
          </View>
          <PrimaryButton title="✨ New Storybook" onPress={() => router.push("/create" as never)} />
          {error ? (
            <Card style={st.errorCard}>
              <Text style={st.errorText}>{error}</Text>
            </Card>
          ) : null}
        </>
      }
      ListEmptyComponent={
        <EmptyState
          emoji="📚"
          title="No Storybooks yet"
          hint="Start from a Moment or create a new Brief — your first illustrated book appears here."
          cta="✨ New Storybook"
          onCta={() => router.push("/create" as never)}
        />
      }
      ItemSeparatorComponent={() => <InsetSeparator indent={66} />}
      onRefresh={load}
      refreshing={loading}
    />
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  copy: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  cover: {
    width: 52,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  coverEmoji: { fontSize: 26 },
  title: { fontFamily: F.displayBold, fontSize: 16, color: C.text },
  meta: { fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 4 },
  chev: { color: C.soft, fontSize: 24, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
