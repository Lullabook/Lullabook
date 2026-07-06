import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { Screen, Eyebrow, PageTitle, Lead, Card, PrimaryButton, GhostButton, PageTurn, Skeleton, SkeletonCard, Twinkle } from "@/components/maya-ui";
import {
  downloadStorybookPdf,
  finalizeStorybook,
  getStorybook,
  illustrationSource,
  rerollPageImage,
  selectPageCandidate,
  type StorybookDetailWire,
  type StorybookPageWire,
} from "@/lib/api";
import { C, F } from "@/constants/theme";

// Issue 145 — audio is cut from R1: the VoicePlayback component (issue 114)
// was removed with it; it returns from git history when R2 re-enables audio.

/** Parent-facing labels — raw status/type enums never reach the screen. */
const STATUS_LABEL: Record<string, string> = {
  generating: "Illustrating…",
  draft: "Ready to read",
  finalized: "Finalized",
  failed: "Needs attention",
};
const TYPE_LABEL: Record<string, string> = {
  bedtime: "Bedtime story",
  adventure: "Adventure story",
  silly: "Silly story",
  learning: "Learning story",
};

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
    return <Skeleton width="100%" height={220} radius={18} />;
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
  // Issue 160 (E4): finalize is deliberate — the CTA opens an inline confirm
  // sheet that names the re-roll lock before anything is sent to the server.
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  // Part3 hardening (E4): flips the moment the finalize ROUTE succeeds — pure
  // server truth, never a local book.status flip. If the follow-up refetch
  // fails, this keeps the (now wrong) draft CTA hidden so the parent can't
  // re-send finalize into a confusing "Only drafts" error; a reload card
  // offers the retry instead.
  const [finalizedOnServer, setFinalizedOnServer] = useState(false);
  // Issue 161 (E1/E6): export is gated on real share capability and shows a
  // blocking in-progress state while the PDF downloads.
  const [canShare, setCanShare] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // E6: hidden, never dead — the expo-web preview can't share a local file
    // (and expo-file-system's File API is native-only), so canShare can never
    // become true on web and the export button simply doesn't render there.
    if (Platform.OS === "web") return;
    Sharing.isAvailableAsync()
      .then(setCanShare)
      .catch(() => setCanShare(false));
  }, []);
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
      // Session expired mid-action: redirect to sign-in like load() does —
      // an inline "Unauthorized" card would be a dead end.
      const message = e instanceof Error ? e.message : "Re-roll failed";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setActionBusy(false);
    }
  }

  // Issue 160 (E4): call the finalize route, then REFETCH via load() — the
  // client never flips the status field itself. On failure the draft is
  // untouched and the error card offers the same affordance again (retryable).
  async function confirmFinalize() {
    if (!book || actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      await finalizeStorybook(book.id);
      // The route succeeded — the book IS finalized on the server. Record that
      // before the refetch so a failed load() can't resurrect the draft CTA.
      setFinalizedOnServer(true);
      setConfirmingFinalize(false);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not finalize — please try again";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setActionBusy(false);
    }
  }

  // Issue 161 — download to the app cache, then hand the file to the native
  // share sheet. E2: on any failure the button returns to idle with a
  // retryable error and the book stays finalized untouched; no auto-retry.
  async function exportPdf() {
    if (!book || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const uri = await downloadStorybookPdf(book.id);
      // E3: the keepsake leaves the device only via this user-initiated sheet.
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Save your keepsake",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Export failed — please try again";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setExporting(false);
    }
  }

  async function pickCandidate(candidateId: string) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await selectPageCandidate(candidateId);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not select candidate";
      if (message.includes("Unauthorized")) {
        router.replace("/sign-in");
        return;
      }
      setError(message);
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    // Skeleton mirrors the reader layout (page card with an illustration
    // block) — renders immediately, no bare-spinner flash (issue 139).
    return (
      <Screen>
        <View style={{ gap: 10 }}>
          <Skeleton width="30%" height={12} radius={6} />
          <Skeleton width="75%" height={28} radius={10} />
        </View>
        <View style={st.skeletonPage}>
          <Skeleton width="100%" height={220} radius={18} />
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (!book) {
    return (
      <Screen>
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error ?? "We couldn't find this Storybook."}</Text>
          <GhostButton title="← Back to the library" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const pages = [...book.pages].sort((a, b) => a.index - b.index);
  const page = pages[pageIndex];
  const generating = book.status === "generating";
  const failed = book.status === "failed";
  const isDraft = book.status === "draft";
  const isFinalized = book.status === "finalized";
  const imageCandidates = page?.candidates.filter((c) => c.kind === "image" && !c.selected) ?? [];

  return (
    <Screen>
      <View>
        <Eyebrow>📚 Storybook</Eyebrow>
        <PageTitle>{book.theme.slice(0, 48)}{book.theme.length > 48 ? "…" : ""}</PageTitle>
        <Lead>
          {generating
            ? "Illustrating your pages — this usually takes a minute."
            : `${TYPE_LABEL[book.storyType] ?? "Story"} · ${STATUS_LABEL[book.status] ?? book.status}`}
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
            This Storybook couldn&apos;t be finished. Some pages may still be readable below, and you can try loading again.
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
          <View style={st.generatingRow}>
            <Twinkle>
              <Text style={{ fontSize: 26 }}>✨</Text>
            </Twinkle>
            <Text style={st.copy}>
              Painting page {pages.filter((p) => p.generationStatus === "ready").length + 1} of your book…
            </Text>
          </View>
          <Skeleton width="100%" height={140} radius={18} />
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
                {imageCandidates.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onPress={() => pickCandidate(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose look ${i + 1}`}
                    style={({ pressed }) => [st.candidateChip, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={st.candidateText}>🎨 Look {i + 1}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          ) : null}

          <View style={st.navRow}>
            <GhostButton
              title="← Prev"
              disabled={pageIndex === 0}
              onPress={() => setPageIndex((i) => Math.max(0, i - 1))}
            />
            <GhostButton
              title="Next →"
              disabled={pageIndex >= pages.length - 1}
              onPress={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
            />
          </View>

          {/* Part3 hardening — finalize succeeded on the server but the
              refetch failed: the local copy still says draft. Tell the truth
              and offer a reload; never a re-confirmable finalize CTA (E4). */}
          {isDraft && finalizedOnServer ? (
            <Card style={st.finalizeCard}>
              <Text style={st.cardTitle}>Your keepsake is finalized! 🎉</Text>
              <Text style={st.copy}>
                We just couldn&apos;t refresh this page — reload to see your finalized book and export it.
              </Text>
              <View style={st.finalizeRow}>
                <PrimaryButton title="↻ Reload" onPress={load} />
              </View>
            </Card>
          ) : null}

          {/* Issue 160 — "Finalize keepsake" is draft-only (E4). The confirm
              sheet names the re-roll lock before anything hits the server. */}
          {isDraft && !finalizedOnServer ? (
            confirmingFinalize ? (
              <Card style={st.finalizeCard}>
                <Text style={st.cardTitle}>Make it a keepsake?</Text>
                <Text style={st.copy}>
                  Finalizing locks re-rolls — every page stays exactly as it looks now, ready to export as a PDF forever.
                </Text>
                <View style={st.finalizeRow}>
                  <GhostButton
                    title="Keep editing"
                    disabled={actionBusy}
                    onPress={() => setConfirmingFinalize(false)}
                  />
                  <PrimaryButton
                    title={actionBusy ? "Finalizing…" : "📖 Yes, finalize"}
                    disabled={actionBusy}
                    onPress={confirmFinalize}
                  />
                </View>
              </Card>
            ) : (
              <PrimaryButton
                title="📖 Finalize keepsake"
                disabled={actionBusy}
                onPress={() => setConfirmingFinalize(true)}
              />
            )
          ) : null}

          {/* Issue 161 — "Export PDF" renders only for a finalized book on a
              platform that can actually share (E6: hidden, never dead). */}
          {isFinalized && canShare ? (
            <PrimaryButton
              title={exporting ? "Preparing your PDF…" : "📕 Export PDF"}
              disabled={exporting}
              onPress={exportPdf}
            />
          ) : null}
        </>
      ) : (
        <Card>
          <Text style={st.copy}>No pages yet — they&apos;ll appear here as the book comes together.</Text>
        </Card>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  copy: { fontFamily: F.body, fontSize: 15, color: C.muted, marginTop: 8 },
  cardTitle: { fontFamily: F.displayBold, fontSize: 17, color: C.text },
  pageLabel: { fontFamily: F.bodyBold, fontSize: 13, color: C.soft, marginBottom: 10 },
  pageText: { fontFamily: F.body, fontSize: 17, lineHeight: 26, color: C.text, marginTop: 14 },
  illustration: { width: "100%", height: 220, borderRadius: 18, backgroundColor: C.surfaceAlt },
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
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  candidateText: { fontFamily: F.bodyBold, color: C.primary, fontSize: 13 },
  errorCard: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  finalizeCard: { borderColor: C.borderSoft, backgroundColor: C.surfaceAlt },
  finalizeRow: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 14 },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
  skeletonPage: { gap: 14 },
  generatingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
