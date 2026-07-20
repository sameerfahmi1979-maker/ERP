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

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { renderNotificationTemplate } from "@/server/actions/notifications/templates";
import { processEmailQueueItem, processEmailQueue } from "@/server/actions/notifications/email-queue";

const REVALIDATE_PATHS = ["/dms/notifications", "/admin/notifications/email-queue"];

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export type DmsBridgeStatus =
  | "not_bridged"
  | "bridged"
  | "email_queued"
  | "email_sent"
  | "failed"
  | "skipped";

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
    lastBridgeError: r.last_bridge_error as string | null,
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

function canBridge(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.admin") ||
    (hasPermission(ctx, "dms.notifications.manage") &&
      hasPermission(ctx, "notifications.email_queue.manage"))
  );
}

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

export async function bridgeDmsNotificationToGlobal(
  dmsNotificationId: number,
  options?: { forceEmail?: boolean; dryRun?: boolean }
): Promise<ActionResult<BridgeSingleResult>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canBridge(ctx)) return { success: false, error: "Permission denied" };

    const dryRun = options?.dryRun ?? false;
    const forceEmail = options?.forceEmail ?? false;

    // Fetch DMS notification row + related document and reminder
    const { data: dmsRow, error: fetchErr } = await supabase
      .from("dms_notification_queue")
      .select(
        `id, document_id, reminder_id, notification_type, channel, status,
         recipient_user_id, recipient_email, subject, message, scheduled_for,
         bridge_status, global_notification_id, global_email_queue_id, bridge_attempt_count,
         metadata_json,
         document:dms_documents!document_id(id, document_no, title, owner_user_id, created_by, owner:user_profiles!owner_user_id(email, full_name)),
         reminder:dms_expiry_reminders!reminder_id(days_before, assigned_to, expiry_date, next_reminder_date)`
      )
      .eq("id", dmsNotificationId)
      .single();

    if (fetchErr || !dmsRow) {
      return { success: false, error: "DMS notification not found" };
    }

    const row = dmsRow as Record<string, unknown>;
    const doc = row.document as Record<string, unknown> | null;
    const reminder = row.reminder as Record<string, unknown> | null;

    // ── Idempotency: already bridged? ──
    const alreadyBridgedId = row.global_notification_id as number | null;
    const alreadyQueuedId = row.global_email_queue_id as number | null;

    if (alreadyBridgedId) {
      return {
        success: true,
        data: {
          dmsNotificationId,
          globalNotificationId: alreadyBridgedId,
          globalEmailQueueId: alreadyQueuedId ?? undefined,
          bridgeStatus: (row.bridge_status as DmsBridgeStatus) ?? "bridged",
          skipped: true,
          reason: "Already bridged",
        },
      };
    }

    // ── Resolve recipient email ──
    let recipientEmail = row.recipient_email as string | null;
    let recipientUserId = row.recipient_user_id as number | null;

    if (!recipientEmail && recipientUserId) {
      const { data: userRow } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", recipientUserId)
        .single();
      recipientEmail = (userRow as Record<string, unknown> | null)?.email as string | null ?? null;
    }

    if (!recipientEmail && doc) {
      const ownerObj = doc.owner as Record<string, unknown> | null;
      recipientEmail = ownerObj?.email as string | null ?? null;
      if (!recipientUserId) {
        recipientUserId = doc.owner_user_id as number | null;
      }
    }

    // ── Build template variables ──
    const expiryDate =
      (reminder?.expiry_date as string | null) ??
      (row.metadata_json as Record<string, unknown> | null)?.expiry_date as string ?? "unknown";
    const daysRemaining =
      (reminder?.days_before as number | null)?.toString() ??
      (row.metadata_json as Record<string, unknown> | null)?.days_remaining as string ?? "";

    const templateCode =
      (row.notification_type as string) === "expired_document"
        ? "DMS_DOCUMENT_EXPIRED"
        : "DMS_EXPIRY_REMINDER";

    const variables: Record<string, string> = {
      document_no: doc?.document_no as string ?? String(row.document_id),
      title: doc?.title as string ?? "",
      document_type: (row.metadata_json as Record<string, unknown> | null)?.document_type as string ?? "",
      expiry_date: expiryDate,
      days_remaining: daysRemaining,
      reminder_days_before: daysRemaining,
      owner_name: (doc?.owner as Record<string, unknown> | null)?.full_name as string ?? "",
      action_url: `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://erp.algt.net").replace(/\/$/, "")}/dms/documents/record/${doc?.id ?? row.document_id}`,
      company_name: "ALGT",
    };

    const rendered = await renderNotificationTemplate(templateCode, variables);
    if (!rendered.success || !rendered.data) {
      return { success: false, error: `Template render failed: ${rendered.error}` };
    }

    if (dryRun) {
      return {
        success: true,
        data: {
          dmsNotificationId,
          bridgeStatus: "not_bridged",
          skipped: true,
          reason: `Dry run: would create notification for ${recipientEmail ?? "no email"}`,
        },
      };
    }

    // ── Create global erp_notifications row ──
    const nowTs = new Date().toISOString();
    const severity = (row.notification_type as string) === "expired_document" ? "urgent" : "warning";

    const { data: notifRow, error: notifErr } = await supabase
      .from("erp_notifications")
      .insert({
        notification_code: `DMS_BRIDGE_${dmsNotificationId}`,
        source_module: "DMS",
        source_entity_type: "dms_documents",
        source_entity_id: row.document_id as number | null,
        notification_type: row.notification_type as string,
        severity,
        title: rendered.data.subject,
        message: rendered.data.textBody,
        recipient_user_id: recipientUserId,
        recipient_email: recipientEmail,
        channel_in_app: true,
        channel_email: !!(recipientEmail),
        scheduled_for: row.scheduled_for as string ?? nowTs,
        action_url: variables.action_url,
        action_label: "View Document",
        metadata_json: {
          dms_notification_id: dmsNotificationId,
          template_code: templateCode,
          variables,
        },
        created_by: ctx.profile.id,
        created_at: nowTs,
        updated_at: nowTs,
      })
      .select("id")
      .single();

    if (notifErr || !notifRow) {
      // Record bridge failure
      await supabase.from("dms_notification_queue").update({
        bridge_status: "failed",
        bridge_attempt_count: (row.bridge_attempt_count as number ?? 0) + 1,
        last_bridge_error: notifErr?.message ?? "Failed to create global notification",
        updated_at: nowTs,
      }).eq("id", dmsNotificationId);
      return { success: false, error: notifErr?.message ?? "Failed to create global notification" };
    }

    const globalNotificationId = (notifRow as Record<string, unknown>).id as number;
    let globalEmailQueueId: number | undefined;
    let bridgeStatus: DmsBridgeStatus = "bridged";

    // ── Queue email if DMS_EXPIRY_EMAILS flag enabled and recipient exists ──
    const { data: flagRow } = await supabase
      .from("erp_email_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_EXPIRY_EMAILS")
      .single();

    const emailFlagEnabled = (flagRow as Record<string, unknown> | null)?.is_enabled as boolean ?? false;

    if ((emailFlagEnabled || forceEmail) && recipientEmail) {
      const { data: queueRow, error: queueErr } = await supabase
        .from("erp_email_queue")
        .insert({
          notification_id: globalNotificationId,
          source_module: "DMS",
          source_entity_type: "dms_documents",
          source_entity_id: row.document_id as number | null,
          priority: severity === "urgent" ? "high" : "normal",
          to_emails: [recipientEmail],
          subject: rendered.data.subject,
          html_body: rendered.data.htmlBody,
          text_body: rendered.data.textBody,
          template_code: templateCode,
          template_variables_json: variables,
          scheduled_for: nowTs,
          attempt_count: 0,
          max_attempts: 3,
          created_by: ctx.profile.id,
          created_at: nowTs,
          updated_at: nowTs,
        })
        .select("id")
        .single();

      if (!queueErr && queueRow) {
        globalEmailQueueId = (queueRow as Record<string, unknown>).id as number;
        bridgeStatus = "email_queued";
      }
    } else if (!recipientEmail) {
      bridgeStatus = "bridged"; // in-app only, no email (no recipient)
    } else {
      bridgeStatus = "bridged"; // flag disabled
    }

    // ── Update DMS notification with bridge tracking ──
    await supabase.from("dms_notification_queue").update({
      global_notification_id: globalNotificationId,
      global_email_queue_id: globalEmailQueueId ?? null,
      bridge_status: bridgeStatus,
      bridge_attempt_count: (row.bridge_attempt_count as number ?? 0) + 1,
      bridged_at: nowTs,
      last_bridge_error: null,
      email_delivery_status: globalEmailQueueId ? "queued" : (recipientEmail ? "flag_disabled" : "no_recipient"),
      updated_at: nowTs,
    }).eq("id", dmsNotificationId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_notification_queue",
      entity_id: dmsNotificationId,
      entity_reference: String(dmsNotificationId),
      action: "update",
      new_values: {
        bridge_status: bridgeStatus,
        global_notification_id: globalNotificationId,
        global_email_queue_id: globalEmailQueueId,
      },
    });

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));

    return {
      success: true,
      data: {
        dmsNotificationId,
        globalNotificationId,
        globalEmailQueueId,
        bridgeStatus,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── bridgeDueDmsNotificationsToGlobal (batch) ────────────────────────────────

export type BridgeBatchResult = {
  total: number;
  bridged: number;
  alreadyDone: number;
  failed: number;
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

    const limit = Math.min(options?.limit ?? 50, 200);

    // Fetch not_bridged or failed rows
    const { data: rows, error } = await supabase
      .from("dms_notification_queue")
      .select("id")
      .in("bridge_status", ["not_bridged", "failed"])
      .in("status", ["pending", "queued", "email_ready"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const results: BridgeSingleResult[] = [];
    let bridged = 0; let alreadyDone = 0; let failed = 0;

    for (const r of rows ?? []) {
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

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_notification_queue",
      entity_id: 0,
      entity_reference: "BATCH",
      action: "update",
      new_values: { bridged, alreadyDone, failed, total: (rows ?? []).length },
    });

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return {
      success: true,
      data: { total: (rows ?? []).length, bridged, alreadyDone, failed, results },
    };
  } catch (e) {
    return { success: false, error: String(e) };
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

export async function processDmsExpiryEmailQueue(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<ActionResult<{ processed: number; sent: number; failed: number; skipped: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (
      !hasPermission(ctx, "notifications.email_queue.process") &&
      !hasPermission(ctx, "notifications.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }
    // Use global processor — it processes all pending items including DMS ones
    const result = await processEmailQueue({
      dryRun: options?.dryRun ?? false,
      limit: options?.limit ?? 20,
    });

    if (!result.success) return { success: false, error: result.error };

    // Sync email_delivery_status back to DMS notification rows that were just sent
    await syncDmsEmailDeliveryStatus();

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return result;
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── retryDmsNotificationBridge ────────────────────────────────────────────────

export async function retryDmsNotificationBridge(dmsNotificationId: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canBridge(ctx)) return { success: false, error: "Permission denied" };

    // Reset bridge status to not_bridged so it re-runs
    await supabase
      .from("dms_notification_queue")
      .update({
        bridge_status: "not_bridged",
        global_notification_id: null,
        global_email_queue_id: null,
        last_bridge_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dmsNotificationId)
      .eq("bridge_status", "failed");

    // Now bridge it again
    return bridgeDmsNotificationToGlobal(dmsNotificationId);
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── markDmsNotificationEmailSkipped ──────────────────────────────────────────

export async function markDmsNotificationEmailSkipped(
  dmsNotificationId: number,
  reason: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canBridge(ctx)) return { success: false, error: "Permission denied" };

    await supabase.from("dms_notification_queue").update({
      bridge_status: "skipped",
      last_bridge_error: reason,
      updated_at: new Date().toISOString(),
    }).eq("id", dmsNotificationId);

    revalidatePath("/dms/notifications");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── syncDmsEmailDeliveryStatus (internal) ────────────────────────────────────
// Pull sent/failed status from erp_email_queue back into dms_notification_queue.

async function syncDmsEmailDeliveryStatus(): Promise<void> {
  try {
    const supabase = await createClient();

    // Find DMS rows where email was queued but status not yet synced
    const { data: rows } = await supabase
      .from("dms_notification_queue")
      .select("id, global_email_queue_id")
      .in("bridge_status", ["email_queued"])
      .not("global_email_queue_id", "is", null)
      .limit(100);

    if (!rows || rows.length === 0) return;

    const queueIds = rows.map((r) => (r as Record<string, unknown>).global_email_queue_id as number);

    const { data: queueRows } = await supabase
      .from("erp_email_queue")
      .select("id, status, sent_at")
      .in("id", queueIds);

    const queueMap = new Map<number, { status: string; sent_at: string | null }>();
    for (const q of queueRows ?? []) {
      const qr = q as Record<string, unknown>;
      queueMap.set(qr.id as number, { status: qr.status as string, sent_at: qr.sent_at as string | null });
    }

    const nowTs = new Date().toISOString();
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const qStatus = queueMap.get(r.global_email_queue_id as number);
      if (!qStatus) continue;

      if (qStatus.status === "sent") {
        await supabase.from("dms_notification_queue").update({
          bridge_status: "email_sent",
          email_delivery_status: "sent",
          email_sent_at: qStatus.sent_at ?? nowTs,
          updated_at: nowTs,
        }).eq("id", r.id as number);
      } else if (qStatus.status === "failed") {
        await supabase.from("dms_notification_queue").update({
          email_delivery_status: "failed",
          updated_at: nowTs,
        }).eq("id", r.id as number);
      }
    }
  } catch {
    // Sync is best-effort; do not throw
  }
}
