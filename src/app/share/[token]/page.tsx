import type { Metadata } from "next";
import { createRequestContext } from "@/lib/context";
import { Reader } from "@/components/reader";

export const metadata: Metadata = {
  title: "A story shared with you",
  robots: { index: false, follow: false },
};

/**
 * Public share view (ADR-0013): token-gated, optionally passcode-gated,
 * never indexed (robots meta + X-Robots-Tag header from next.config).
 * Illustrations are served as short-lived signed URLs minted server-side —
 * share viewers have no account and never touch the authed image resolver.
 */
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ passcode?: string }>;
}) {
  const { token } = await params;
  const { passcode } = await searchParams;

  const ctx = createRequestContext();
  await ctx.store.hydrateByShareToken(token);
  const book = ctx.sharing.accessViaShareLink(token, passcode);

  if (!book) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#FBF4E7",
          fontFamily: "var(--v2-font-body)",
          color: "#2E2438",
          display: "flex",
          justifyContent: "center",
          padding: "10vh 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            background: "#FFFDF9",
            border: "1px solid #ECE1CE",
            borderRadius: 22,
            padding: 28,
            boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
            height: "fit-content",
          }}
        >
          <p style={{ textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.74rem", fontWeight: 800, color: "#8B6DF0", margin: "0 0 6px" }}>
            Shared storybook
          </p>
          <h1 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 800, fontSize: "1.8rem", color: "#2E2438", margin: "0 0 8px" }}>
            This story is tucked away
          </h1>
          <p style={{ color: "#6E6076", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 18px" }}>
            The link may have expired or been revoked — or it may need a
            passcode.
          </p>
          <form method="get" className="v2-stack" style={{ gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="passcode" style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color: "#2E2438", fontSize: "0.95rem" }}>Passcode</label>
              <input
                id="passcode"
                name="passcode"
                type="text"
                autoFocus
                style={{ width: "100%", fontFamily: "var(--v2-font-body)", fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px", boxSizing: "border-box" }}
              />
            </div>
            <button className="v2-btn v2-btn--primary" type="submit">
              Open the book
            </button>
          </form>
        </div>
      </main>
    );
  }

  const pages = await Promise.all(
    ctx.store.getPagesForStorybook(book.id).map(async (p) => ({
      index: p.index,
      text: p.text,
      imageSrc: p.illustrationBlobKey
        ? await ctx.blobs.signedUrl(p.illustrationBlobKey)
        : p.illustrationUrl,
    }))
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FBF4E7",
        fontFamily: "var(--v2-font-body)",
        color: "#2E2438",
        maxWidth: 920,
        margin: "0 auto",
        padding: "5vh 24px",
        boxSizing: "border-box",
      }}
    >
      <p style={{ textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.74rem", fontWeight: 800, color: "#8B6DF0", margin: "0 0 6px" }}>
        A story shared with you
      </p>
      <h1 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 800, fontSize: "2.2rem", color: "#2E2438", margin: "0 0 20px" }}>
        {book.brief.theme}
      </h1>
      <Reader title={book.brief.theme} pages={pages} />
      <p style={{ marginTop: "2rem", textAlign: "center", fontSize: "0.86rem", color: "#9A8A78" }}>
        Made with Lullabook — storybooks starring the people you love.
      </p>
    </main>
  );
}
