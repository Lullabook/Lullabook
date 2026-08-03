import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAnimatedComponent } from "react-native-reanimated";
import { router } from "expo-router";
import {
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
import { BookCover, bookPalette } from "@/components/story-cover";
import { listStorybooks, type StorybookSummary } from "@/lib/api";
import { C, F } from "@/constants/theme";
import { shouldShowInitialSkeleton } from "@/lib/render-state";

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

// Banner/cover text creams — decorative cover-illustration colors (same
// category as story-cover's BOOK_PALETTES, mirrored from the web's
// .v2-continue-banner), not interactive UI tokens.
const BANNER_CREAM = "#FAF4E6";
const BANNER_CREAM_SOFT = "rgba(250,244,230,0.82)";

function BookRow({ book }: { book: StorybookSummary }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  return (
    <AnimatedPressable
      onPress={() => router.push(`/stories/${book.id}` as never)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Open ${book.theme}`}
      style={[st.row, style]}
    >
      <View style={st.coverWrap}>
        <BookCover theme={book.theme} status={book.status} seed={book.id} compact />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.title}>{book.theme}</Text>
        <Text style={st.meta}>{statusLabel(book.status)} · {TYPE_LABEL[book.storyType] ?? "Story"}</Text>
      </View>
      <Text style={st.chev}>›</Text>
    </AnimatedPressable>
  );
}

/** Port of the web shelf's .v2-continue-banner — the most recent readable
 * draft, resumable in one tap. Gradient reuses the book's own cover sky so
 * banner and cover always match. */
function ContinueBanner({ book }: { book: StorybookSummary }) {
  const { style, onPressIn, onPressOut } = usePressFeedback({ kind: "selection" });
  const sky = bookPalette(book.id).sky;
  return (
    <AnimatedPressable
      onPress={() => router.push(`/stories/${book.id}` as never)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Resume reading ${book.theme}`}
      style={style}
    >
      <BrandGradient colors={sky} fallback={sky[0]} style={st.banner}>
        <View style={st.bannerCover}>
          <BookCover theme={book.theme} status={book.status} seed={book.id} compact />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.bannerLabel}>📖 Continue reading</Text>
          <Text style={st.bannerTitle} numberOfLines={2}>{book.theme}</Text>
          <Text style={st.bannerMeta}>{TYPE_LABEL[book.storyType] ?? "Story"} · ▶ Resume reading</Text>
        </View>
      </BrandGradient>
    </AnimatedPressable>
  );
}

export default function StorybookLibraryScreen() {
  const [books, setBooks] = useState<StorybookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

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
      setHasLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (shouldShowInitialSkeleton(loading, hasLoaded)) {
    return (
      <ListScreen
        data={[]}
        keyExtractor={() => "loading"}
        renderItem={() => null}
        ListHeaderComponent={<><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
      />
    );
  }

  // Web parity (stories-shelf.tsx): continueReading is the newest readable
  // draft. listStorybooks already returns newest-first, so find() is enough —
  // no new API calls.
  const resume = books.find((b) => b.status === "draft") ?? null;

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
          {resume ? <ContinueBanner book={resume} /> : null}
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
      ItemSeparatorComponent={() => <InsetSeparator indent={70} />}
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
  coverWrap: { width: 56 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 22,
    padding: 16,
    overflow: "hidden",
    shadowColor: "#3A2850",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  bannerCover: { width: 64 },
  bannerLabel: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: BANNER_CREAM_SOFT,
  },
  bannerTitle: { fontFamily: F.display, fontSize: 19, color: BANNER_CREAM, marginTop: 2 },
  bannerMeta: { fontFamily: F.bodyBold, fontSize: 13, color: BANNER_CREAM_SOFT, marginTop: 6 },
  title: { fontFamily: F.displayBold, fontSize: 16, color: C.text },
  meta: { fontFamily: F.body, fontSize: 13, color: C.muted, marginTop: 4 },
  chev: { color: C.soft, fontSize: 24, fontFamily: F.bodyBold },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
