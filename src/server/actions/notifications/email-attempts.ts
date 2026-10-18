"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/check";
import { requireQueuePermission } from "@/lib/email/queue/policy";
import { boundedQuery } from "@/lib/email/queue/runtime-limits";

export type EmailAttemptEvent = { id: number; attempt_number: number; event: string; created_at: string };
export async function getEmailAttemptHistory(id: number): Promise<{success:boolean; data?:EmailAttemptEvent[]; error?:string}> {
  try {
    requireQueuePermission(await getAuthContext(), "view");
    if (!Number.isSafeInteger(id) || id < 1) return {success:false,error:"Invalid queue reference."};
    const db = createAdminClient();
    const queue = await boundedQuery(db.from("erp_email_queue").select("id").eq("id",id).is("deleted_at",null).maybeSingle());
    if (queue.error || !queue.data) return {success:false,error:"Queue record unavailable."};
    // Globally authorized service-only read. No lease tokens, correlation IDs,
    // addresses, bodies or raw provider errors are returned to the browser.
    const result = await boundedQuery(db.from("erp_email_attempt_events").select("id,attempt_number,event,created_at").eq("queue_id",id).order("id",{ascending:false}).limit(100));
    if (result.error) return {success:false,error:"Attempt history unavailable."};
    return {success:true,data:result.data as EmailAttemptEvent[]};
  } catch { return {success:false,error:"Attempt history unavailable or not authorized."}; }
}
