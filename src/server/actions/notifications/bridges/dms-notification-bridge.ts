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
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createNotification } from "@/server/actions/notifications/notifications";
import { queueEmail } from "@/server/actions/notifications/email-queue";
import { renderNotificationTemplate } from "@/server/actions/notifications/templates";

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
export async function bridgeDmsNotificationToGlobalNotification(
  dmsNotificationId: number
): Promise<ActionResult<BridgeResult>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied — notifications.admin required" };
    }

    const { data: dmsRow, error: fetchErr } = await supabase
      .from("dms_notification_queue")
      .select("*, document:dms_documents(document_no, title)")
      .eq("id", dmsNotificationId)
      .single();

    if (fetchErr || !dmsRow) return { success: false, error: "DMS notification not found" };

    const row = dmsRow as Record<string, unknown>;
    const doc = row.document as Record<string, unknown> | null;

    // Skip if already bridged (check metadata)
    if (row.status === "sent") {
      return {
        success: true,
        data: { dmsNotificationId, skipped: true, reason: "Already sent in DMS queue" },
      };
    }

    // Determine template code
    const templateCode = row.notification_type === "expiry_reminder"
      ? "DMS_EXPIRY_REMINDER"
      : "DMS_DOCUMENT_EXPIRED";

    const variables: Record<string, string> = {
      document_no: doc?.document_no as string ?? String(row.document_id),
      title: doc?.title as string ?? "",
      expiry_date: (row.metadata_json as Record<string, unknown>)?.expiry_date as string ?? "unknown",
    };

    const rendered = await renderNotificationTemplate(templateCode, variables);
    if (!rendered.success || !rendered.data) {
      return { success: false, error: `Template render failed: ${rendered.error}` };
    }

    // Create global notification
    const notifResult = await createNotification({
      source_module: "DMS",
      source_entity_type: "dms_documents",
      source_entity_id: row.document_id as number,
      notification_type: row.notification_type as string,
      severity: row.notification_type === "expired_document" ? "urgent" : "warning",
      title: rendered.data.subject,
      message: rendered.data.textBody,
      recipient_user_id: row.recipient_user_id as number | null ?? undefined,
      recipient_email: row.recipient_email as string | null ?? undefined,
      channel_in_app: true,
      channel_email: !!(row.recipient_email),
      notification_code: `DMS_BRIDGE_${dmsNotificationId}`,
      metadata_json: { dms_notification_id: dmsNotificationId },
    });

    if (!notifResult.success || !notifResult.data) {
      return { success: false, error: `Failed to create global notification: ${notifResult.error}` };
    }

    let emailQueueId: number | undefined;

    // Queue email if recipient email is available
    if (row.recipient_email) {
      const emailResult = await queueEmail({
        source_module: "DMS",
        source_entity_type: "dms_documents",
        source_entity_id: row.document_id as number | undefined,
        notification_id: notifResult.data.id,
        priority: row.notification_type === "expired_document" ? "high" : "normal",
        to_emails: [row.recipient_email as string],
        subject: rendered.data.subject,
        html_body: rendered.data.htmlBody ?? undefined,
        text_body: rendered.data.textBody,
        template_code: templateCode,
        template_variables_json: variables,
        max_attempts: 3,
      });

      if (emailResult.success && emailResult.data) {
        emailQueueId = emailResult.data.id;
      }
    }

    return {
      success: true,
      data: {
        dmsNotificationId,
        globalNotificationId: notifResult.data.id,
        emailQueueId,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Bridge multiple pending DMS notifications. Admin-manual only.
 * Limit defaults to 20.
 */
export async function bridgeDueDmsNotifications(
  limit = 20
): Promise<ActionResult<{ bridged: number; failed: number; skipped: number; results: BridgeResult[] }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied — notifications.admin required" };
    }

    const { data: rows, error } = await supabase
      .from("dms_notification_queue")
      .select("id")
      .in("status", ["pending", "queued"])
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const results: BridgeResult[] = [];
    let bridged = 0; let failed = 0; let skipped = 0;

    for (const r of rows ?? []) {
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

    return { success: true, data: { bridged, failed, skipped, results } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
