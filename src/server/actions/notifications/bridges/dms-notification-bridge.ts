"use server";

/**
 * DMS Notification Bridge — ERP DMS.8A preparation
 *
 * These helpers allow bridging dms_notification_queue records into the global
 * erp_notifications / erp_email_queue tables.
 *
 * NOT used automatically in this phase. Manual admin-only execution.
 * Full automation belongs to ERP DMS.8A.
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import {canUseDmsEmailBridge} from "@/lib/email/queue/dms-policy";
import {bridgeDmsEmailSource} from "@/server/dms-email-source";
import {boundedQuery,F09_LIMITS} from "@/lib/email/queue/runtime-limits";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export type BridgeResult = {
  dmsNotificationId: number;
  globalNotificationId?: number;
  emailQueueId?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

/**
 * Bridge a single dms_notification_queue record into global engine.
 * Creates erp_notifications record + erp_email_queue item if channel_email is set.
 */
export async function bridgeDmsNotificationToGlobalNotification(dmsNotificationId:number):Promise<ActionResult<BridgeResult>> {
 return bridgeDmsEmailSource(dmsNotificationId);
}

/**
 * Bridge multiple pending DMS notifications. Admin-manual only.
 * Limit defaults to 20.
 */
export async function bridgeDueDmsNotifications(
  limit = 20
): Promise<ActionResult<{ bridged: number; failed: number; skipped: number; deferred:number; results: BridgeResult[] }>> {
  try {
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)return {success:false,error:"Invalid bridge limit."};
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canUseDmsEmailBridge(ctx)) {
      return { success: false, error: "Permission denied — notifications.admin required" };
    }

    const { data: rows, error } = await boundedQuery(supabase
      .from("dms_notification_queue")
      .select("id")
      .in("status", ["pending", "queued"])
      .limit(limit));

    if (error) return { success: false, error:'Permitted delivery sources could not be loaded.' };

    const results: BridgeResult[] = [];
    let bridged = 0; let failed = 0; let skipped = 0;
    const until=Date.now()+F09_LIMITS.batchStartMs;

    for (const r of rows ?? []) {
      if(Date.now()>=until)break;
      const row = r as Record<string, unknown>;
      const result = await bridgeDmsNotificationToGlobalNotification(row.id as number);
      if (result.success && result.data) {
        results.push(result.data);
        if (result.data.skipped) skipped++;
        else bridged++;
      } else {
        failed++;
        results.push({ dmsNotificationId: row.id as number, error: result.error });
      }
    }

    return { success: true, data: { bridged, failed, skipped,deferred:(rows??[]).length-results.length, results } };
  } catch {
    return { success: false, error:'Bridge batch is unconfirmed. Reconcile the same sources before retrying.' };
  }
}
