import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Auth Confirm Route
 *
 * Handles Supabase PKCE code exchange for:
 * - Invite links (admin-created users)
 * - Password reset links
 * - Email confirmation links
 *
 * Flow:
 *   Supabase email link → this route (?code=...) → exchange code → redirect
 *
 * The `redirectTo` passed to generateLink must be registered in:
 *   Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
 *   Add: https://erp.algt.net/auth/confirm
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const type = searchParams.get("type") ?? "invite";
  // next is an optional override for where to land after confirmation
  const next = searchParams.get("next") ?? "/dashboard";

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // For invite and recovery types, send user to set their password
      if (type === "invite" || type === "recovery") {
        return NextResponse.redirect(`${siteOrigin}/reset-password`);
      }
      return NextResponse.redirect(`${siteOrigin}${next}`);
    }

    console.error("auth/confirm code exchange error:", error.message);
  }

  // Code missing or exchange failed — redirect to login with error notice
  return NextResponse.redirect(
    `${siteOrigin}/login?error=invalid_invite_link`
  );
}
