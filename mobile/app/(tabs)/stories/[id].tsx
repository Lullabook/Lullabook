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
import {
  READER_POLL_BUDGET_MS,
  READER_POLL_INTERVAL_MS,
  classifyGenerationError,
  generationProgressCopy,
  isPollBudgetExhausted,
  isTerminalStatus,
  shouldPollStorybook,
  type GenerationFailure,
} from "@/lib/generation-flow";
import { BookCover } from "@/components/story-cover";
import { C, F } from "@/constants/theme";
import { recordStartup } from "@/lib/startup-timing";

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
  const [error, setError] = useState<GenerationFailure | null>(null);
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
  // Issue 101/187: bounded poll — never spin forever. A book that hasn't
  // reached a terminal state within the five-minute watchdog budget is
  // surfaced as a timed-out state with a retry, never an infinite
  // "Illustrating" spinner. The budget lives in the pure module so tests and
  // the reader can never drift apart.
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollStartedRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!storybookId) return;
    try {
      const data = await getStorybook(storybookId);
      setBook(data);
      setError(null);
      // Issue 191: first successful story read = the native "first-read"
      // milestone (dev-only breadcrumb; no-op in production).
      recordStartup("first-read");
      // Issue 187 — polling stops the moment the server reports a terminal
      // status (draft/failed/finalized); the reader never polls a finished book.
      if (isTerminalStatus(data.status)) {
        setPollTimedOut(false);
        pollStartedRef.current = null;
      }
    } catch (e) {
      const failure = classifyGenerationError(e);
      if (failure.kind === "sign-in") {
        router.replace("/sign-in");
        return;
      }
      setError(failure);
    } finally {
      setLoading(false);
    }
  }, [storybookId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!book || !shouldPollStorybook(book.status, pollTimedOut)) return;
    if (pollStartedRef.current === null) pollStartedRef.current = Date.now();
    const timer = setInterval(() => {
      if (
        isPollBudgetExhausted(
          pollStartedRef.current,
          Date.now(),
          READER_POLL_BUDGET_MS
        )
      ) {
        setPollTimedOut(true);
        clearInterval(timer);
        return;
      }
      load();
    }, READER_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [book?.status, load, pollTimedOut]);

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
      setError(classifyGenerationError(e));
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
      setError(classifyGenerationError(e));
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
      setError(classifyGenerationError(e));
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
      setError(classifyGenerationError(e));
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
          {/* Issue 187 — typed copy only: a raw error string never renders.
              Every failure carries a retry (or the Back support action). */}
          <Text style={st.errorText}>{error ? error.message : "We couldn't find this Storybook."}</Text>
          <View style={st.errorActions}>
            {error?.retryable ? <GhostButton title="↻ Try again" onPress={load} /> : null}
            <GhostButton title="← Back to the library" onPress={() => router.back()} />
          </View>
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
      {/* Web parity (reader header): the same illustrated cover as the shelf,
          beside the title — cover art matches everywhere via seed=book.id. */}
      <View style={st.headerRow}>
        <View style={st.headerCover}>
          <BookCover theme={book.theme} status={book.status} seed={book.id} compact />
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow>📚 Storybook</Eyebrow>
          <PageTitle>{book.theme.slice(0, 48)}{book.theme.length > 48 ? "…" : ""}</PageTitle>
          <Lead>
            {generating
              ? generationProgressCopy(book.progress)
              : `${TYPE_LABEL[book.storyType] ?? "Story"} · ${STATUS_LABEL[book.status] ?? book.status}`}
          </Lead>
        </View>
      </View>

      {error ? (
        <Card style={st.errorCard}>
          <Text style={st.errorText}>{error.message}</Text>
          {/* Issue 187 — every displayed failure has a typed action: a
              retryable failure re-loads; non-retryable failures show copy
              only (support/navigation handled at their own sites). */}
          {error.retryable ? (
            <View style={st.errorActions}>
              <GhostButton title="↻ Try again" onPress={load} />
            </View>
          ) : error.kind === "support" ? (
            <View style={st.errorActions}>
              <GhostButton title="← Back to the library" onPress={() => router.back()} />
            </View>
          ) : null}
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
        <>
          {/* Issue 187 — server-derived progress: phase copy + ready/total
              counts come from GET /api/storybooks/:id progress, never from
              client guessing. */}
          <Card>
            <View style={st.generatingRow}>
              <Twinkle>
                <Text style={{ fontSize: 26 }}>✨</Text>
              </Twinkle>
              <Text style={st.copy}>{generationProgressCopy(book.progress)}</Text>
            </View>
          </Card>
          {page ? (
            <>
              {/* Progressive reader: Story text + the server-derived Page
                  count render as soon as the Page exists, long before every
                  Page is terminal. */}
              <PageTurn pageKey={pageIndex}>
                <Card>
                  <Text style={st.pageLabel}>
                    Page {page.index + 1} of {book.progress.pagesTotal}
                  </Text>
                  <PageIllustration page={page} />
                  <Text style={st.pageText}>{page.text || "…"}</Text>
                </Card>
              </PageTurn>
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
            </>
          ) : (
            <Card>
              <Skeleton width="100%" height={140} radius={18} />
            </Card>
          )}
        </>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerCover: { width: 64 },
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
  errorActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 14 },
  finalizeCard: { borderColor: C.borderSoft, backgroundColor: C.surfaceAlt },
  finalizeRow: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 14 },
  errorText: { color: C.danger, fontFamily: F.bodyBold },
  skeletonPage: { gap: 14 },
  generatingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
