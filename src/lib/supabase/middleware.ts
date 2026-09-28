import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedAppPath, safeAuthDestination } from "@/lib/auth/navigation";

/** Session refresh/UX only. Actions, data access and RLS authorize independently. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = NextResponse.next({ request });
        previous.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    } },
  );
  const redirect = (path: string) => {
    const redirected = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach(cookie => redirected.cookies.set(cookie));
    redirected.headers.set("Cache-Control", "private, no-store, max-age=0");
    redirected.headers.set("Pragma", "no-cache");
    return redirected;
  };
  const pathname = request.nextUrl.pathname;
  const signInPage = pathname === "/login" || pathname === "/signup";
  let user = null;
  let unavailable = false;
  try {
    const result = await supabase.auth.getUser();
    user = result.error ? null : result.data.user;
    unavailable = !!result.error && result.error.status !== 400 && result.error.status !== 401 && result.error.status !== 403;
  } catch {
    unavailable = true;
  }
  if (!user && isProtectedAppPath(pathname)) {
    const query = new URLSearchParams({ redirectTo: safeAuthDestination(pathname + request.nextUrl.search) });
    if (unavailable) query.set("error", "auth_unavailable");
    return redirect(`/login?${query}`);
  }
  // Recovery/confirmation and explicit errors remain accessible in existing sessions.
  if (user && signInPage && !request.nextUrl.searchParams.has("error")) {
    return redirect(safeAuthDestination(request.nextUrl.searchParams.get("redirectTo")));
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
