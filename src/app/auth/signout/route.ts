import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, isConfigured, publicConfig } from "@/lib/config";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== appUrl()) {
    return new NextResponse("Invalid request origin", { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/login", appUrl()), 303);
  response.headers.set("Cache-Control", "private, no-store");
  if (!isConfigured()) return response;

  const { url, key } = publicConfig();
  const cookieName = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error)
      console.warn("Sign-out revocation failed; clearing browser session.");
  } catch {
    console.warn("Sign-out service unavailable; clearing browser session.");
  } finally {
    // Expire every session chunk even when Auth is unavailable or the token expired.
    for (const { name } of request.cookies.getAll()) {
      if (
        name === cookieName ||
        name.startsWith(`${cookieName}.`) ||
        name === `${cookieName}-code-verifier` ||
        name.startsWith(`${cookieName}-code-verifier.`)
      ) {
        response.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          sameSite: "lax",
        });
      }
    }
  }
  return response;
}
