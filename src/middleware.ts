import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and rewrites the
 * session cookies onto the response. Without this, a freshly signed-in user
 * can hit a protected page before the session cookie is durably set — the
 * page bounces to sign-in until a manual refresh. (Supabase SSR requirement.)
 *
 * Guarded: if Supabase env is absent (e.g. a build with no secrets), the
 * middleware is a no-op so public routes still serve.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  // Issue 191: time the Supabase session refresh and surface it as a
  // Server-Timing header — deterministic request instrumentation, numbers
  // only (never session content).
  const started = performance.now();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching getUser() triggers a token refresh and the setAll cookie write.
  await supabase.auth.getUser();

  response.headers.set("Server-Timing", `session-refresh;dur=${(performance.now() - started).toFixed(2)}`);

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
