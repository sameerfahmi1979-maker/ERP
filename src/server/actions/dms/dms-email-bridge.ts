"use server";

/**
 * ERP DMS.8A — DMS to Global Email Bridge
 *
 * Connects dms_notification_queue to erp_notifications / erp_email_queue.
 * All email delivery goes through the global email provider abstraction (SETTINGS.2).
 * No Microsoft Graph calls are made from this module.
 *
 * Bridge is IDEMPOTENT: re-running will not create duplicate rows.
 */

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/actions/audit";
import { processEmailQueue } from "@/server/actions/notifications/email-queue";
import {requireQueuePermission} from "@/lib/email/queue/policy";
import {boundedQuery,F09_LIMITS} from "@/lib/email/queue/runtime-limits";
import {bridgeDmsEmailSource} from "@/server/dms-email-source";
import {canUseDmsEmailBridge,type DmsEmailBridgeState} from "@/lib/email/queue/dms-policy";
import { revalidatePath } from "next/cache";

const REVALIDATE_PATHS = ["/dms/notifications", "/admin/notifications/email-queue"];

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export type DmsBridgeStatus = DmsEmailBridgeState;

export type DmsEmailBridgeRow = {
  id: number;
  documentId: number | null;
  notificationType: string;
  status: string;
  recipientEmail: string | null;
  subject: string;
  bridgeStatus: DmsBridgeStatus;
  bridgeAttemptCount: number;
  bridgedAt: string | null;
  lastBridgeError: string | null;
  emailDeliveryStatus: string | null;
  emailSentAt: string | null;
  globalNotificationId: number | null;
  globalEmailQueueId: number | null;
  createdAt: string;
  document?: { document_no: string; title: string } | null;
};

function rowToBridge(r: Record<string, unknown>): DmsEmailBridgeRow {
  const doc = r.document as Record<string, unknown> | null;
  return {
    id: r.id as number,
    documentId: r.document_id as number | null,
    notificationType: r.notification_type as string,
    status: r.status as string,
    recipientEmail: r.recipient_email as string | null,
    subject: r.subject as string,
    bridgeStatus: (r.bridge_status as DmsBridgeStatus) ?? "not_bridged",
    bridgeAttemptCount: (r.bridge_attempt_count as number) ?? 0,
    bridgedAt: r.bridged_at as string | null,
    lastBridgeError: r.last_bridge_error ? 'Bridge issue recorded; review authorized delivery history.' : null,
    emailDeliveryStatus: r.email_delivery_status as string | null,
    emailSentAt: r.email_sent_at as string | null,
    globalNotificationId: r.global_notification_id as number | null,
    globalEmailQueueId: r.global_email_queue_id as number | null,
    createdAt: r.created_at as string,
    document: doc
      ? { document_no: doc.document_no as string, title: doc.title as string }
      : null,
  };
}

const canBridge=canUseDmsEmailBridge;

// ── getDmsEmailBridgeStatus ───────────────────────────────────────────────────

export async function getDmsEmailBridgeStatus(
  filters?: { bridge_status?: DmsBridgeStatus; limit?: number }
): Promise<ActionResult<DmsEmailBridgeRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (
      !hasPermission(ctx, "dms.notifications.view") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }

    let q = supabase
      .from("dms_notification_queue")
      .select(
        "id, document_id, notification_type, status, recipient_email, subject, bridge_status, bridge_attempt_count, bridged_at, last_bridge_error, email_delivery_status, email_sent_at, global_notification_id, global_email_queue_id, created_at, document:dms_documents!document_id(document_no, title)"
      )
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 200);

    if (filters?.bridge_status) q = q.eq("bridge_status", filters.bridge_status);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data ?? []).map((r) => rowToBridge(r as Record<string, unknown>)),
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── bridgeDmsNotificationToGlobal (idempotent) ───────────────────────────────

export type BridgeSingleResult = {
  dmsNotificationId: number;
  globalNotificationId?: number;
  globalEmailQueueId?: number;
  bridgeStatus: DmsBridgeStatus;
  skipped?: boolean;
  reason?: string;
};

export async function bridgeDmsNotificationToGlobal(dmsNotificationId:number,options?:{forceEmail?:boolean;dryRun?:boolean}):Promise<ActionResult<BridgeSingleResult>> {
 const result=await bridgeDmsEmailSource(dmsNotificationId,options);
 if(!result.success||!result.data)return {success:false,error:result.error??'Bridge result unconfirmed.'};
 REVALIDATE_PATHS.forEach(p=>revalidatePath(p));
 const r=result.data;
 return {success:true,data:{dmsNotificationId:r.dmsNotificationId,globalNotificationId:r.globalNotificationId,globalEmailQueueId:r.emailQueueId,bridgeStatus:r.bridgeStatus,skipped:r.skipped,reason:r.reason}};
}

// ── bridgeDueDmsNotificationsToGlobal (batch) ────────────────────────────────

export type BridgeBatchResult = {
  total: number;
  bridged: number;
  alreadyDone: number;
  failed: number;
  deferred: number;
  results: BridgeSingleResult[];
};

export async function bridgeDueDmsNotificationsToGlobal(options?: {
  limit?: number;
  dryRun?: boolean;
  forceEmail?: boolean;
}): Promise<ActionResult<BridgeBatchResult>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canBridge(ctx)) return { success: false, error: "Permission denied" };

    const limit=options?.limit??20;
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)return {success:false,error:'Invalid bridge limit.'};

    // Fetch not_bridged or failed rows
    const { data: rows, error } = await boundedQuery(supabase
      .from("dms_notification_queue")
      .select("id")
      .in("bridge_status", ["not_bridged", "failed"])
      .in("status", ["pending", "queued", "email_ready"])
      .order("created_at", { ascending: true })
      .limit(limit));

    if (error) return { success: false, error: 'Permitted delivery sources could not be loaded.' };

    const results: BridgeSingleResult[] = [];
    let bridged = 0; let alreadyDone = 0; let failed = 0;
    const until=Date.now()+F09_LIMITS.batchStartMs;

    for (const r of rows ?? []) {
      if(Date.now()>=until)break;
      const id = (r as Record<string, unknown>).id as number;
      const res = await bridgeDmsNotificationToGlobal(id, options);
      if (res.success && res.data) {
        results.push(res.data);
        if (res.data.skipped) alreadyDone++;
        else bridged++;
      } else {
        failed++;
        results.push({ dmsNotificationId: id, bridgeStatus: "failed", reason: res.error });
      }
    }

    const deferred=(rows??[]).length-results.length;
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_notification_queue",
      entity_id: 0,
      entity_reference: "BATCH",
      action: "update",
      new_values: { bridged, alreadyDone, failed, deferred,total: (rows ?? []).length },
    });

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return {
      success: failed===0,
      data: { total: (rows ?? []).length, bridged, alreadyDone, failed,deferred, results },
      ...(failed?{error:'Some original bridge outcomes remain unconfirmed. Review their receipts before retrying.'}:{}),
    };
  } catch {
    return { success: false, error: 'Bridge batch is unconfirmed. Reconcile the same sources before retrying.' };
  }
}

// ── queueDmsNotificationEmail ────────────────────────────────────────────────

export async function queueDmsNotificationEmail(
  dmsNotificationId: number,
  options?: { forceEmail?: boolean }
): Promise<ActionResult<{ globalEmailQueueId?: number }>> {
  // Re-bridge with email forced
  const result = await bridgeDmsNotificationToGlobal(dmsNotificationId, {
    forceEmail: options?.forceEmail ?? true,
  });
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: { globalEmailQueueId: result.data?.globalEmailQueueId } };
}

// ── queueDueDmsExpiryEmails (batch) ──────────────────────────────────────────

export async function queueDueDmsExpiryEmails(options?: {
  limit?: number;
  dryRun?: boolean;
}): Promise<ActionResult<BridgeBatchResult>> {
  return bridgeDueDmsNotificationsToGlobal({ ...options, forceEmail: true });
}

// ── processDmsExpiryEmailQueue ────────────────────────────────────────────────
// Delegates to global email queue processor — does NOT re-implement email logic.

export async function processDmsExpiryEmailQueue(options?:{dryRun?:boolean;limit?:number}):ReturnType<typeof processEmailQueue>{
 try{
  requireQueuePermission(await getAuthContext(),'process');
  const result=await processEmailQueue({dryRun:options?.dryRun??false,limit:options?.limit??20});
  REVALIDATE_PATHS.forEach(p=>revalidatePath(p));
  return result;
 }catch{return {success:false,error:'Delivery processing could not be confirmed. Inspect the queue before retrying.'};}
}

// ── retryDmsNotificationBridge ────────────────────────────────────────────────

export async function retryDmsNotificationBridge(dmsNotificationId:number):Promise<ActionResult> {
 // Reconcile the original source/notification/queue identities; never clear a
 // link to an accepted or uncertain delivery just to make another attempt.
 return bridgeDmsNotificationToGlobal(dmsNotificationId);
}

// ── markDmsNotificationEmailSkipped ──────────────────────────────────────────

export async function markDmsNotificationEmailSkipped(_dmsNotificationId:number,_reason:string):Promise<ActionResult>{
 void _dmsNotificationId;void _reason;
 return {success:false,error:'Use Cancel on the authorized Email Queue. A bridge marker cannot safely cancel or recall a dispatched email; no record was changed.'};
}
