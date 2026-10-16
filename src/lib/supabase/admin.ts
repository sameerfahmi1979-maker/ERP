import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getAdminConfig } from "@/lib/config/server-features";
import { applyReadAttemptScope } from "./read-attempt-scope";

/** Server-only Supabase client with service role. Never import in client components. */
export function createAdminClient() {
  const { url, serviceKey } = getAdminConfig();

  return applyReadAttemptScope(createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }));
}
