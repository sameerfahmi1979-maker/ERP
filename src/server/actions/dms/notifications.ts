"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { getDmsNotificationSettingsForScheduler } from "@/server/actions/dms/notification-settings";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type DmsNotificationRow = {
  id: number;
  document_id: number | null;
  reminder_id: number | null;
  renewal_request_id: number | null;
  notification_type: string;
  channel: string;
  status: string;
  recipient_user_id: number | null;
  recipient_email: string | null;
  subject: string;
  message: string;
  scheduled_for: string;
  sent_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  delivery_attempts: number;
  last_error: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
  // DMS.8A bridge fields
  bridge_status?: string | null;
  bridge_attempt_count?: number;
  bridged_at?: string | null;
  last_bridge_error?: string | null;
  email_delivery_status?: string | null;
  email_sent_at?: string | null;
  global_notification_id?: number | null;
  global_email_queue_id?: number | null;
  // joined
  document?: { id: number; document_no: string; title: string } | null;
  recipient?: { full_name: string | null; email: string | null } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function canViewNotifications(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.notifications.view") ||
    hasPermission(ctx, "dms.notifications.manage") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canManageNotifications(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.notifications.manage") || hasPermission(ctx, "dms.admin");
}

const NOTIFICATION_SELECT = `
  id, document_id, reminder_id, renewal_request_id, notification_type, channel,
  status, recipient_user_id, recipient_email, subject, message,
  scheduled_for, sent_at, read_at, dismissed_at, delivery_attempts, last_error,
  metadata_json, created_at, updated_at,
  bridge_status, bridge_attempt_count, bridged_at, last_bridge_error,
  email_delivery_status, email_sent_at, global_notification_id, global_email_queue_id,
  document:dms_documents!document_id(id, document_no, title),
  recipient:user_profiles!recipient_user_id(full_name, email)
`;

// ── getDmsNotifications ────────────────────────────────────────────────────────

export type DmsNotificationsFilter = {
  myOnly?: boolean;
  status?: string;
  channel?: string;
  unreadOnly?: boolean;
  bridgeStatus?: string;
  limit?: number;
};

export async function getDmsNotifications(
  filter: DmsNotificationsFilter = {}
): Promise<ActionResult<DmsNotificationRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewNotifications(ctx)) return { success: false, error: "Permission denied" };

    let query = supabase
      .from("dms_notification_queue")
      .select(NOTIFICATION_SELECT)
      .order("scheduled_for", { ascending: false })
      .limit(filter.limit ?? 200);

    if (filter.myOnly && ctx.profile?.id) {
      query = query.eq("recipient_user_id", ctx.profile.id);
    }
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.channel) query = query.eq("channel", filter.channel);
    if (filter.unreadOnly) query = query.is("read_at", null).not("status", "eq", "dismissed");
    if (filter.bridgeStatus) query = query.eq("bridge_status", filter.bridgeStatus);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as DmsNotificationRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── generateDmsExpiryNotifications ────────────────────────────────────────────
// DMS.1: Enhanced to read global recipient settings for role/user expansion.

export async function generateDmsExpiryNotifications(
  options: { limit?: number } = {}
): Promise<ActionResult<{ created: number; skipped: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageNotifications(ctx)) return { success: false, error: "Permission denied" };

    const today = new Date().toISOString().split("T")[0];

    // Get due reminders with document info
    const { data: dueReminders, error: remError } = await supabase
      .from("dms_expiry_reminders")
      .select(
        `id, document_id, reminder_days_before, reminder_date, notification_status,
         document:dms_documents!document_id(id, document_no, title, expiry_date, created_by, owner_user_id)`
      )
      .lte("reminder_date", today)
      .eq("status", "pending")
      .neq("notification_status", "sent")
      .limit(options.limit ?? 100);

    if (remError) return { success: false, error: remError.message };

    // Load global settings once for the batch
    const globalSettings = await getDmsNotificationSettingsForScheduler();

    let created = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const reminder of dueReminders ?? []) {
      const rem = reminder as Record<string, unknown>;
      const doc = rem.document as Record<string, unknown> | null;
      if (!doc) { skipped++; continue; }

      const documentId = rem.document_id as number;
      const remId = rem.id as number;
      const daysBefore = rem.reminder_days_before as number;
      const expiryDate = doc.expiry_date as string | null;

      const isExpired = daysBefore === 0 || (expiryDate && new Date(expiryDate) < new Date());
      const subject = isExpired
        ? `DMS Document Expired: ${doc.document_no} — ${doc.title}`
        : `DMS Expiry Reminder: ${doc.document_no} — ${doc.title}`;
      const message = isExpired
        ? `Document ${doc.document_no} (${doc.title}) has expired on ${expiryDate ?? "N/A"}. Please review and start renewal if required.`
        : `Document ${doc.document_no} (${doc.title}) expires on ${expiryDate}. Reminder: ${daysBefore} days before expiry. Please review and start renewal if required.`;

      // ── Build recipient list ──────────────────────────────────────────────
      const recipientIds: Set<number> = new Set();

      // Always include owner and creator if settings allow
      const includeOwner = globalSettings?.include_document_owner ?? true;
      const includeCreator = globalSettings?.include_document_creator ?? true;
      if (includeOwner && doc.owner_user_id) recipientIds.add(doc.owner_user_id as number);
      if (includeCreator && doc.created_by) recipientIds.add(doc.created_by as number);

      // Additional global user recipients
      if (globalSettings?.recipient_user_ids?.length) {
        for (const uid of globalSettings.recipient_user_ids) {
          recipientIds.add(uid);
        }
      }

      // Expand role recipients to user IDs
      // user_roles table uses user_profile_id + role_id (FK to roles.role_code)
      if (globalSettings?.recipient_roles?.length) {
        const { data: roleUsers } = await supabase
          .from("user_roles")
          .select("user_profile_id, role:roles!role_id(role_code)")
          .eq("is_active", true);
        for (const ru of roleUsers ?? []) {
          const rur = ru as Record<string, unknown>;
          const roleRow = rur.role as Record<string, unknown> | null;
          if (
            roleRow?.role_code &&
            globalSettings.recipient_roles.includes(roleRow.role_code as string) &&
            rur.user_profile_id
          ) {
            recipientIds.add(rur.user_profile_id as number);
          }
        }
      }

      // Fallback if still empty
      if (recipientIds.size === 0) recipientIds.add(ctx.profile.id);

      // ── Insert one notification per unique recipient ───────────────────────
      let anyInserted = false;
      for (const rid of recipientIds) {
        const { error: insertErr } = await supabase.from("dms_notification_queue").insert({
          document_id: documentId,
          reminder_id: remId,
          notification_type: isExpired ? "document_expired" : "expiry_reminder",
          channel: "in_app",
          status: "pending",
          recipient_user_id: rid,
          subject,
          message,
          scheduled_for: now,
          metadata_json: { days_before: daysBefore, expiry_date: expiryDate },
          created_at: now,
          updated_at: now,
        });
        if (!insertErr) anyInserted = true;
      }

      if (anyInserted) {
        // Mark reminder notification_status = sent
        await supabase
          .from("dms_expiry_reminders")
          .update({ notification_status: "sent", last_notification_at: now, updated_at: now })
          .eq("id", remId);

        await supabase.from("dms_document_events").insert({
          document_id: documentId,
          event_type: "expiry_notification_created",
          description: subject,
          performed_by: ctx.profile.id,
          metadata_json: { reminder_id: remId, days_before: daysBefore },
        });

        created++;
      } else {
        skipped++;
      }
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_notification_queue",
      entity_id: 0,
      entity_reference: `batch-${now}`,
      action: "create",
      new_values: { created, skipped },
    });

    revalidatePath("/dms/notifications");
    revalidatePath("/dms/expiring");
    return { success: true, data: { created, skipped } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── markDmsNotificationRead ───────────────────────────────────────────────────

export async function markDmsNotificationRead(id: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("dms_notification_queue")
      .update({ status: "read", read_at: now, updated_at: now })
      .eq("id", id)
      .or(`recipient_user_id.eq.${ctx.profile.id},recipient_user_id.is.null`);

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: null,
      event_type: "expiry_notification_read",
      description: `Notification ${id} marked as read`,
      performed_by: ctx.profile.id,
      metadata_json: { notification_id: id },
    }).maybeSingle();

    revalidatePath("/dms/notifications");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── dismissDmsNotification ────────────────────────────────────────────────────

export async function dismissDmsNotification(id: number, reason?: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("dms_notification_queue")
      .update({ status: "dismissed", dismissed_at: now, last_error: reason ?? null, updated_at: now })
      .eq("id", id)
      .or(`recipient_user_id.eq.${ctx.profile.id},recipient_user_id.is.null`);

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: null,
      event_type: "expiry_notification_dismissed",
      description: `Notification ${id} dismissed${reason ? `: ${reason}` : ""}`,
      performed_by: ctx.profile.id,
      metadata_json: { notification_id: id, reason },
    }).maybeSingle();

    revalidatePath("/dms/notifications");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getUnreadDmsNotificationsCount ────────────────────────────────────────────

export async function getUnreadDmsNotificationsCount(): Promise<ActionResult<number>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: true, data: 0 };

    const { count } = await supabase
      .from("dms_notification_queue")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", ctx.profile.id)
      .eq("status", "pending")
      .is("read_at", null);

    return { success: true, data: count ?? 0 };
  } catch {
    return { success: true, data: 0 };
  }
}
