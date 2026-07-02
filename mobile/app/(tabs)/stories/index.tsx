import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Eyebrow,
  PageTitle,
  Lead,
  Card,
  PrimaryButton,
  SkeletonRow,
  EmptyState,
  ListScreen,
  InsetSeparator,
} from "@/components/maya-ui";
import { listStorybooks, type StorybookSummary } from "@/lib/api";
import { C, F } from "@/constants/theme";

function statusLabel(status: StorybookSummary["status"]): string {
  switch (status) {
    case "generating":
      return "✨ Illustrating…";
    case "draft":
      return "📖 Ready to read";
    case "finalized":
      return "🌟 Finalized";
    case "failed":
      return "Needs attention";
    default:
      return status;
  }
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
      renderItem={({ item: book }) => (
        <Pressable
          onPress={() => router.push(`/stories/${book.id}` as never)}
          style={st.row}
        >
          <View style={st.cover}>
            <Text style={st.coverEmoji}>📖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{book.theme}</Text>
            <Text style={st.meta}>{statusLabel(book.status)} · {book.storyType}</Text>
          </View>
          <Text style={st.chev}>›</Text>
        </Pressable>
      )}
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
    backgroundColor: C.primaryBg,
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
