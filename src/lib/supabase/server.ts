import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withDocumentReadPolicy } from "./document-read-policy";
import { performanceFetch } from "@/lib/performance/trace";
import { applyReadAttemptScope } from "./read-attempt-scope";
import { createMobileSupabaseClient, mobileAccessToken } from "./mobile-request";

export async function createClient() {
  const token = mobileAccessToken();
  if (token) return createMobileSupabaseClient(token);
  const cookieStore = await cookies();

  return withDocumentReadPolicy(applyReadAttemptScope(createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: performanceFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware will refresh sessions.
          }
        },
      },
    },
  )));
}
