import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";

/**
 * Export a finalized Storybook as a PDF keepsake (ADR-0007 export path).
 * Issue 161: auth resolves via `resolveRequestAuth` (cookie session OR Bearer
 * JWT) — the shipping caller is the native app's authenticated download (E3);
 * the previous cookie-only `getAuthedContext` rejected every mobile request.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const authed = await resolveRequestAuth(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pdf = await authed.ctx.exportSvc.exportPdf(authed.member.id, id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lullabook-${id}.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 400 }
    );
  }
}
