import "server-only";
import { performanceFetch } from "@/lib/performance/trace";
import { createClient } from "@supabase/supabase-js";
import { getAdminConfig } from "@/lib/config/server-features";

/** Server-only Supabase client with service role. Never import in client components. */
export function createAdminClient() {
  const { url, serviceKey } = getAdminConfig();

  return createClient(url, serviceKey, {
    global: { fetch: performanceFetch },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
