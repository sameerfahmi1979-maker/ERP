import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getAdminConfig } from "@/lib/config/server-features";
import { jobScopedFetch } from "@/lib/dms/ai-jobs/claim-scope";
import { performanceFetch } from "@/lib/performance/trace";

/** Isolated file I/O deadline for SDK storage methods without per-call abort options. */
export function boundedChatStorage(signal:AbortSignal) {
  const {url,serviceKey}=getAdminConfig();
  const scoped=jobScopedFetch(performanceFetch);
  const fetchBound:typeof fetch=(input,init)=>{
    const inherited=init?.signal ?? (input instanceof Request ? input.signal : null);
    const combined=inherited ? AbortSignal.any([inherited,signal]) : signal;
    return scoped(input,{...init,signal:combined});
  };
  return createClient(url,serviceKey,{global:{fetch:fetchBound},auth:{persistSession:false,autoRefreshToken:false}}).storage;
}
