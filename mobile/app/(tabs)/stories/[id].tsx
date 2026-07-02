import { useCallback, useEffect, useRef, useState } from "react";
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
import { getAudio } from "@/lib/audio";
import { Screen, Eyebrow, PageTitle, Lead, Card, PrimaryButton, GhostButton, PageTurn } from "@/components/maya-ui";
import {
  getStorybook,
  illustrationSource,
  rerollPageImage,
  selectPageCandidate,
  getVoicePlaybackUrl,
  type StorybookDetailWire,
  type StorybookPageWire,
} from "@/lib/api";
import { C, F } from "@/constants/theme";

/** Issue 114 — Voice clip playback (lullaby/narration). Starts < 1s from cache. */
function VoicePlayback({ clipId }: { clipId: string }) {
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState<import("expo-av").Audio.Sound | null>(null);

  async function play() {
    const Audio = getAudio();
    if (!Audio) {
      setPlaying(false);
      return;
    }
    try {
      const { url } = await getVoicePlaybackUrl(clipId);
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: url });
      setSound(newSound);
      setPlaying(true);
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate((status) => {
        if ("didJustFinish" in status && status.didJustFinish) {
          setPlaying(false);
        }
      });
    } catch {
      setPlaying(false);
    }
  }

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  return (
    <Pressable style={st.voiceBtn} onPress={play} disabled={playing}>
      <Text style={st.voiceBtnText}>{playing ? "⏸ Playing…" : "▶ Play narration"}</Text>
    </Pressable>
  );
}

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
  // Issue 101: bounded poll — never spin forever. A book that hasn't reached a
  // terminal state within the budget is surfaced as a timed-out state with a
  // retry, never an infinite "Illustrating" spinner.
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollStartedRef = useRef<number | null>(null);
  const POLL_BUDGET_MS = 5 * 60 * 1000;

  const load = useCallback(async () => {
    if (!storybookId) return;
    try {
      const data = await getStorybook(storybookId);
      setBook(data);
      setError(null);
      if (data.status === "draft" || data.status === "failed" || data.status === "finalized") {
        setPollTimedOut(false);
        pollStartedRef.current = null;
      }
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
    if (pollStartedRef.current === null) pollStartedRef.current = Date.now();
    const timer = setInterval(() => {
      if (pollStartedRef.current !== null && Date.now() - pollStartedRef.current > POLL_BUDGET_MS) {
        setPollTimedOut(true);
        clearInterval(timer);
        return;
      }
      load();
    }, 2500);
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
  const failed = book.status === "failed";
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

      {/* Issue 101: failed book — a clear terminal state, never an infinite
          spinner. Surfaces a retry affordance (re-load) so the reader isn't a
          dead end. */}
      {failed ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>
            This Storybook couldn't be finished. Some pages may still be readable below, and you can try loading again.
          </Text>
          <PrimaryButton title={actionBusy ? "Retrying…" : "↻ Try again"} onPress={load} />
        </Card>
      ) : null}

      {/* Issue 101: poll timeout — the book is still `generating` past the
          bounded watchdog budget. Surface it instead of spinning forever. */}
      {pollTimedOut && generating ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>
            Generation is taking longer than expected. You can keep waiting or try again.
          </Text>
          <View style={st.navRow}>
            <GhostButton title="↻ Retry" onPress={() => { setPollTimedOut(false); pollStartedRef.current = Date.now(); load(); }} />
            <GhostButton title="Back" onPress={() => router.back()} />
          </View>
        </Card>
      ) : null}

      {generating && !pollTimedOut ? (
        <Card>
          <ActivityIndicator color={C.primary} />
          <Text style={st.copy}>Generating page {pages.filter((p) => p.generationStatus === "ready").length + 1}…</Text>
        </Card>
      ) : page ? (
        <>
          <PageTurn pageKey={pageIndex}>
            <Card>
              <Text style={st.pageLabel}>Page {page.index + 1} of {pages.length}</Text>
              <PageIllustration page={page} />
              <Text style={st.pageText}>{page.text || "…"}</Text>
              {/* Issue 145 — audio cut from R1: voice clip playback UI removed.
                  Kept behind config (R1_AUDIO_ENABLED) for R2 re-enable. */}
            </Card>
          </PageTurn>

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
  voiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: C.primaryBg,
    alignSelf: "flex-start",
  },
  voiceBtnText: { color: C.primary, fontFamily: F.bodyBold, fontSize: 14 },
});
