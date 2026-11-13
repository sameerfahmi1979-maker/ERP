import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { performanceFetch } from "@/lib/performance/trace";
import { withDocumentReadPolicy } from "./document-read-policy";
import { applyReadAttemptScope } from "./read-attempt-scope";

const requestToken = new AsyncLocalStorage<string>();

export function withMobileToken<T>(token: string, work: () => T): T {
  return requestToken.run(token, work);
}

export function mobileAccessToken() {
  return requestToken.getStore();
}

export function createMobileSupabaseClient(token?: string) {
  return withDocumentReadPolicy(applyReadAttemptScope(createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: performanceFetch, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) },
    },
  )));
}
