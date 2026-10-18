"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { assertInternalActionUrl } from "@/lib/security/action-url";
import {readUnreadNotificationCount} from "@/server/reads/notifications";
import {changePersonalNotification,markAllPersonalNotificationsRead} from "@/server/notification-personal-state";

const REVALIDATE_PATH = "/notifications";
const REVALIDATE_ADMIN_PATH = "/admin/notifications";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationRow = {
  id: number;
  notificationCode: string | null;
  sourceModule: string;
  sourceEntityType: string | null;
  sourceEntityId: number | null;
  notificationType: string;
  severity: string;
  title: string;
  message: string;
  recipientUserId: number | null;
  recipientRoleCode: string | null;
  recipientEmail: string | null;
  channelInApp: boolean;
  channelEmail: boolean;
  status: string;
  scheduledFor: string;
  readAt: string | null;
  dismissedAt: string | null;
  archivedAt: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  metadataJson: unknown;
  createdAt: string;
  updatedAt: string;
};

function rowToNotification(r: Record<string, unknown>): NotificationRow {
  return {
    id: r.id as number,
    notificationCode: r.notification_code as string | null,
    sourceModule: r.source_module as string,
    sourceEntityType: r.source_entity_type as string | null,
    sourceEntityId: r.source_entity_id as number | null,
    notificationType: r.notification_type as string,
    severity: r.severity as string,
    title: r.title as string,
    message: r.message as string,
    recipientUserId: r.recipient_user_id as number | null,
    recipientRoleCode: r.recipient_role_code as string | null,
    recipientEmail: r.recipient_email as string | null,
    channelInApp: r.channel_in_app as boolean,
    channelEmail: r.channel_email as boolean,
    status: r.status as string,
    scheduledFor: r.scheduled_for as string,
    readAt: r.read_at as string | null,
    dismissedAt: r.dismissed_at as string | null,
    archivedAt: r.archived_at as string | null,
    actionUrl: r.action_url as string | null,
    actionLabel: r.action_label as string | null,
    metadataJson: r.metadata_json,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const createNotificationSchema = z.object({
  source_module: z.string().min(1).max(50),
  source_entity_type: z.string().max(100).nullable().optional(),
  source_entity_id: z.number().int().positive().nullable().optional(),
  notification_type: z.string().min(1).max(100),
  severity: z.enum(["info", "success", "warning", "urgent", "critical"]).default("info"),
  title: z.string().min(1).max(500),
  message: z.string().min(1).max(5000),
  recipient_user_id: z.number().int().positive().nullable().optional(),
  recipient_role_code: z.string().max(100).nullable().optional(),
  recipient_email: z.string().email().nullable().optional(),
  channel_in_app: z.boolean().default(true),
  channel_email: z.boolean().default(false),
  scheduled_for: z.string().nullable().optional(),
  action_url: z.string().max(1000).nullable().optional(),
  action_label: z.string().max(200).nullable().optional(),
  metadata_json: z.record(z.string(), z.unknown()).nullable().optional(),
  notification_code: z.string().max(200).nullable().optional(),
});

// ── getMyNotifications ────────────────────────────────────────────────────────

export async function getMyNotifications(
  filters?: { status?: string; limit?: number }
): Promise<ActionResult<NotificationRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    let q = supabase
      .from("erp_notifications")
      .select("*")
      .eq("recipient_user_id", ctx.profile.id)
      .eq("channel_in_app", true)
      .lte("scheduled_for", new Date().toISOString())
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 100);

    if (filters?.status) q = q.eq("status", filters.status);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => rowToNotification(r as Record<string, unknown>)) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getAllNotifications (admin) ────────────────────────────────────────────────

export async function getAllNotifications(
  filters?: { status?: string; source_module?: string; limit?: number }
): Promise<ActionResult<NotificationRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasGlobalPermission(ctx, "notifications.admin") && !hasGlobalPermission(ctx, "notifications.manage")) {
      return { success: false, error: "Permission denied" };
    }

    let q = supabase
      .from("erp_notifications")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 200);

    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.source_module) q = q.eq("source_module", filters.source_module);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => rowToNotification(r as Record<string, unknown>)) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getUnreadNotificationCount ────────────────────────────────────────────────

export async function getUnreadNotificationCount(): Promise<ActionResult<{ count: number }>> {
  return readUnreadNotificationCount();
}

// ── createNotification ────────────────────────────────────────────────────────

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

export async function createNotification(
  input: CreateNotificationInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasGlobalPermission(ctx, "notifications.manage") && !hasGlobalPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = createNotificationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const safeActionUrl = assertInternalActionUrl(parsed.data.action_url);
    const { data, error } = await supabase
      .from("erp_notifications")
      .insert({
        ...parsed.data,
        action_url: safeActionUrl,
        scheduled_for: parsed.data.scheduled_for ?? now,
        created_by: ctx.profile.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    const row = data as Record<string, unknown>;

    await logAudit({
      module_code: "NOTIFICATIONS",
      entity_name: "erp_notifications",
      entity_id: row.id as number,
      entity_reference: parsed.data.notification_code ?? String(row.id),
      action: "create",
      new_values: { source_module: parsed.data.source_module, notification_type: parsed.data.notification_type },
    });

    revalidatePath(REVALIDATE_PATH);
    revalidatePath(REVALIDATE_ADMIN_PATH);
    return { success: true, data: { id: row.id as number } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── markNotificationRead ──────────────────────────────────────────────────────

export async function markNotificationRead(id: number): Promise<ActionResult> {
  const result=await changePersonalNotification(id,"read");
  if(result.success)revalidatePath(REVALIDATE_PATH);
  return result;
}

// ── markAllMyNotificationsRead ────────────────────────────────────────────────

export async function markAllMyNotificationsRead(expectedIdentity:string): Promise<ActionResult<{ count: number }>> {
  if(typeof expectedIdentity!=='string'||!expectedIdentity||expectedIdentity.length>65536)return {success:false,error:'Refresh your session before marking notifications read.'};
  const result=await markAllPersonalNotificationsRead(expectedIdentity);
  if(result.success)revalidatePath(REVALIDATE_PATH);
  return result;
}

// ── dismissNotification ───────────────────────────────────────────────────────

export async function dismissNotification(id: number): Promise<ActionResult> {
  const result=await changePersonalNotification(id,"dismissed");
  if(result.success)revalidatePath(REVALIDATE_PATH);
  return result;
}

// ── archiveNotification ───────────────────────────────────────────────────────

export async function archiveNotification(id: number): Promise<ActionResult> {
  const result=await changePersonalNotification(id,"archived");
  if(result.success)revalidatePath(REVALIDATE_PATH);
  return result;
}
