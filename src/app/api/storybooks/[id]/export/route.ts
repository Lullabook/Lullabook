import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/auth";

/** Export a finalized Storybook as a PDF keepsake (ADR-0007 export path). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const authed = await getAuthedContext();
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
