"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ────────────────────────────────────────────────────────────────────

export type DmsNotificationSettingsRow = {
  id: number;
  is_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  /** Array of integers: days before expiry to remind, e.g. [90,60,30,14,7,1,0] */
  reminder_days_before: number[];
  include_document_owner: boolean;
  include_document_creator: boolean;
  /** Array of role_code strings */
  recipient_roles: string[];
  /** Array of user_profile id integers */
  recipient_user_ids: number[];
  config_name: string;
  notes: string | null;
  updated_by: number | null;
  updated_at: string;
};

// ── Zod Schema ───────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  is_enabled: z.boolean().default(true),
  email_enabled: z.boolean().default(false),
  in_app_enabled: z.boolean().default(true),
  reminder_days_before: z
    .array(z.number().int().min(0).max(365))
    .min(1, "At least one reminder day is required")
    .default([90, 60, 30, 14, 7, 1, 0]),
  include_document_owner: z.boolean().default(true),
  include_document_creator: z.boolean().default(true),
  recipient_roles: z.array(z.string().min(1)).default([]),
  recipient_user_ids: z.array(z.number().int().positive()).default([]),
  config_name: z.string().min(1).max(200).default("Default DMS Notification Settings"),
  notes: z.string().max(1000).nullable().optional(),
});

export type SaveDmsNotificationSettingsInput = z.infer<typeof settingsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    isGlobalAdmin(ctx) ||
    hasPermission(ctx, "dms.admin") ||
    hasPermission(ctx, "dms.notifications.manage") ||
    hasPermission(ctx, "dms.notifications.settings.manage")
  );
}

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    isGlobalAdmin(ctx) ||
    hasPermission(ctx, "dms.admin") ||
    hasPermission(ctx, "dms.notifications.manage") ||
    hasPermission(ctx, "dms.notifications.view") ||
    hasPermission(ctx, "dms.notifications.settings.manage")
  );
}

function rowToSettings(r: Record<string, unknown>): DmsNotificationSettingsRow {
  return {
    id: r.id as number,
    is_enabled: r.is_enabled as boolean,
    email_enabled: r.email_enabled as boolean,
    in_app_enabled: r.in_app_enabled as boolean,
    reminder_days_before: (r.reminder_days_before as number[]) ?? [90, 60, 30, 14, 7, 1, 0],
    include_document_owner: r.include_document_owner as boolean,
    include_document_creator: r.include_document_creator as boolean,
    recipient_roles: (r.recipient_roles as string[]) ?? [],
    recipient_user_ids: (r.recipient_user_ids as number[]) ?? [],
    config_name: r.config_name as string,
    notes: r.notes as string | null,
    updated_by: r.updated_by as number | null,
    updated_at: r.updated_at as string,
  };
}

// ── getDmsNotificationSettings ────────────────────────────────────────────────

export async function getDmsNotificationSettings(): Promise<
  ActionResult<DmsNotificationSettingsRow>
> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_notification_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      // Row may not exist yet — return safe defaults
      return {
        success: true,
        data: {
          id: 1,
          is_enabled: true,
          email_enabled: false,
          in_app_enabled: true,
          reminder_days_before: [90, 60, 30, 14, 7, 1, 0],
          include_document_owner: true,
          include_document_creator: true,
          recipient_roles: [],
          recipient_user_ids: [],
          config_name: "Default DMS Notification Settings",
          notes: null,
          updated_by: null,
          updated_at: new Date().toISOString(),
        },
      };
    }

    return { success: true, data: rowToSettings(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── saveDmsNotificationSettings ───────────────────────────────────────────────

export async function saveDmsNotificationSettings(
  input: SaveDmsNotificationSettingsInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManage(ctx)) return { success: false, error: "Permission denied — dms.admin or dms.notifications.manage required" };

    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const payload = {
      ...parsed.data,
      updated_by: ctx.profile.id,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("dms_notification_settings")
      .upsert({ id: 1, ...payload, created_at: now })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_notification_settings",
      entity_id: 1,
      entity_reference: "global-settings",
      action: "update",
      new_values: {
        is_enabled: parsed.data.is_enabled,
        email_enabled: parsed.data.email_enabled,
        reminder_days_before: parsed.data.reminder_days_before,
        recipient_roles: parsed.data.recipient_roles,
        recipient_user_ids: parsed.data.recipient_user_ids,
      },
    });

    revalidatePath("/admin/dms/notification-settings");
    return { success: true, data: { id: (data as Record<string, unknown>).id as number } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsNotificationSettingsPublic ─────────────────────────────────────────
// Used by the scheduler / bridge to read recipient config without auth context.
// MUST only be called from server-side scheduler code (Edge Function or server action).

export async function getDmsNotificationSettingsForScheduler(): Promise<DmsNotificationSettingsRow | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_notification_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error || !data) return null;
    return rowToSettings(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Lookup options for the settings UI ───────────────────────────────────────

export type RoleOption = { role_code: string; role_name: string };
export type UserOption = { id: number; full_name: string | null; display_name: string | null };

export async function getDmsNotificationRecipientOptions(): Promise<
  ActionResult<{ roles: RoleOption[]; users: UserOption[] }>
> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const [rolesResult, usersResult] = await Promise.all([
      supabase
        .from("roles")
        .select("role_code, role_name")
        .order("role_name"),
      supabase
        .from("user_profiles")
        .select("id, full_name, display_name")
        .eq("status", "active")
        .order("full_name"),
    ]);

    const roles: RoleOption[] = (rolesResult.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return { role_code: row.role_code as string, role_name: row.role_name as string };
    });

    const users: UserOption[] = (usersResult.data ?? []).map((u) => {
      const row = u as Record<string, unknown>;
      return {
        id: row.id as number,
        full_name: row.full_name as string | null,
        display_name: row.display_name as string | null,
      };
    });

    return { success: true, data: { roles, users } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
