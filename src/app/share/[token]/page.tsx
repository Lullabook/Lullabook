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
      <main className="shell" style={{ maxWidth: 440, paddingTop: "10vh" }}>
        <div className="card">
          <p className="eyebrow">Shared storybook</p>
          <h1>This story is tucked away</h1>
          <p className="muted">
            The link may have expired or been revoked — or it may need a
            passcode.
          </p>
          <form method="get" className="stack">
            <div className="field">
              <label htmlFor="passcode">Passcode</label>
              <input id="passcode" name="passcode" type="text" autoFocus />
            </div>
            <button className="btn btn-primary" type="submit">
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
    <main className="shell">
      <p className="eyebrow">A story shared with you</p>
      <h1>{book.brief.theme}</h1>
      <Reader title={book.brief.theme} pages={pages} />
      <p className="subtle" style={{ marginTop: "2rem", textAlign: "center" }}>
        Made with Lullabook — storybooks starring the people you love.
      </p>
    </main>
  );
}
