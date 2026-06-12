import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase";

/** Supabase auth callback: exchange the OAuth/magic-link code for a session. */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/library";
  if (code) {
    const supabase = await createAuthClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
