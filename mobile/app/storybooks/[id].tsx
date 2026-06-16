import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen, Eyebrow, PageTitle, Lead, Card, PrimaryButton, GhostButton } from "@/components/maya-ui";
import {
  getStorybook,
  illustrationSource,
  rerollPageImage,
  selectPageCandidate,
  type StorybookDetailWire,
  type StorybookPageWire,
} from "@/lib/api";
import { C, F } from "@/constants/theme";

function PageIllustration({ page }: { page: StorybookPageWire }) {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!page.illustrationBlobKey) {
      setSource(null);
      return;
    }
    illustrationSource(page.illustrationBlobKey).then(setSource).catch(() => setSource(null));
  }, [page.illustrationBlobKey]);

  if (page.generationStatus === "failed") {
    return (
      <View style={st.illHole}>
        <Text style={st.illHoleText}>This page needs a re-roll</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View style={st.illPlaceholder}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return <Image source={source} style={st.illustration} accessibilityLabel="Story illustration" />;
}

export default function StorybookReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const storybookId = Array.isArray(id) ? id[0] : id;

  const [book, setBook] = useState<StorybookDetailWire | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!storybookId) return;
    try {
      const data = await getStorybook(storybookId);
      setBook(data);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load Storybook";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [storybookId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!book || book.status === "draft" || book.status === "failed" || book.status === "finalized") return;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [book?.status, load]);

  async function rerollCurrent() {
    const page = book?.pages[pageIndex];
    if (!page || actionBusy) return;
    setActionBusy(true);
    try {
      await rerollPageImage(page.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-roll failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function pickCandidate(candidateId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await selectPageCandidate(candidateId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not select candidate");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!book) {
    return (
      <Screen>
        <Text style={st.errorText}>{error ?? "Storybook not found"}</Text>
      </Screen>
    );
  }

  const pages = book.pages.sort((a, b) => a.index - b.index);
  const page = pages[pageIndex];
  const generating = book.status === "generating";
  const imageCandidates = page?.candidates.filter((c) => c.kind === "image" && !c.selected) ?? [];

  return (
    <Screen>
      <View>
        <Eyebrow>📚 Storybook</Eyebrow>
        <PageTitle>{book.theme.slice(0, 48)}{book.theme.length > 48 ? "…" : ""}</PageTitle>
        <Lead>
          {generating
            ? "Illustrating your pages — this usually takes a minute."
            : `${book.storyType} · ${book.status}`}
        </Lead>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error}</Text>
        </Card>
      ) : null}

      {generating ? (
        <Card>
          <ActivityIndicator color={C.primary} />
          <Text style={st.copy}>Generating page {pages.filter((p) => p.generationStatus === "ready").length + 1}…</Text>
        </Card>
      ) : page ? (
        <>
          <Card>
            <Text style={st.pageLabel}>Page {page.index + 1} of {pages.length}</Text>
            <PageIllustration page={page} />
            <Text style={st.pageText}>{page.text || "…"}</Text>
          </Card>

          {page.generationStatus === "failed" ? (
            <PrimaryButton title={actionBusy ? "Re-rolling…" : "🎲 Re-roll illustration"} onPress={rerollCurrent} />
          ) : null}

          {imageCandidates.length > 0 ? (
            <Card>
              <Text style={st.cardTitle}>Pick a look</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.candidateRow}>
                {imageCandidates.map((c) => (
                  <Pressable key={c.id} onPress={() => pickCandidate(c.id)} style={st.candidateChip}>
                    <Text style={st.candidateText}>Option</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          ) : null}

          <View style={st.navRow}>
            <GhostButton title="← Prev" onPress={() => setPageIndex((i) => Math.max(0, i - 1))} />
            <GhostButton title="Next →" onPress={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))} />
          </View>
        </>
      ) : (
        <Card>
          <Text style={st.copy}>No pages yet.</Text>
        </Card>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  copy: { fontFamily: F.body, fontSize: 15, color: C.muted, marginTop: 8 },
  cardTitle: { fontFamily: F.displayBold, fontSize: 17, color: C.text },
  pageLabel: { fontFamily: F.bodyBold, fontSize: 13, color: C.soft, marginBottom: 10 },
  pageText: { fontFamily: F.body, fontSize: 17, lineHeight: 26, color: C.text, marginTop: 14 },
  illustration: { width: "100%", height: 220, borderRadius: 18, backgroundColor: C.surfaceAlt },
  illPlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: 18,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  illHole: {
    width: "100%",
    height: 220,
    borderRadius: 18,
    backgroundColor: C.dangerBg,
    borderWidth: 1,
    borderColor: C.dangerBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  illHoleText: { fontFamily: F.bodyBold, color: C.danger, textAlign: "center" },
  navRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  candidateRow: { gap: 10, paddingVertical: 4 },
  candidateChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  candidateText: { fontFamily: F.bodyBold, color: C.primary, fontSize: 13 },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
});
