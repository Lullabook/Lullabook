import { NextResponse } from "next/server";
import { requireAuthedContext } from "@/lib/auth";

/** Poll training personas for the Family progress rail. */
export async function GET() {
  const { ctx, member } = await requireAuthedContext();
  const personas = ctx.store
    .getPersonasByFamily(member.familyId, member.id)
    .filter((p) => p.status === "training")
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      kind: p.kind,
      createdAt: p.createdAt.toISOString(),
    }));
  return NextResponse.json({ training: personas });
}
