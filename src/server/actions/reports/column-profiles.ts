"use server";

/**
 * Global ERP Report Center — Column Profiles Server Actions
 * Phase: REPORT.5 — Email / Scheduling / Report History / Security UAT
 *
 * Column profiles control visible/hidden/order for already-authorized columns.
 * Redacted/omitted columns remain unavailable regardless of profile.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface ColumnConfig {
  key: string;
  visible: boolean;
  order: number;
  width?: number;
}

export interface ColumnProfile {
  id: number;
  report_id: number;
  user_profile_id: number;
  profile_name: string;
  column_config_json: ColumnConfig[];
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// List column profiles for a report
// ─────────────────────────────────────────────────────────────────────────────

export async function listColumnProfiles(
  reportCode: string
): Promise<ActionResult<ColumnProfile[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "Permission denied." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const db = createAdminClient();

    const { data: registry } = await db
      .from("erp_report_registry")
      .select("id")
      .eq("report_code", reportCode)
      .maybeSingle();

    if (!registry) {
      return { success: false, error: `Report '${reportCode}' not found.` };
    }

    const { data, error } = await db
      .from("erp_report_column_profiles")
      .select("*")
      .eq("report_id", (registry as { id: number }).id)
      .is("deleted_at", null)
      .or(`user_profile_id.eq.${ctx.profile.id},is_shared.eq.true`)
      .order("is_default", { ascending: false })
      .order("profile_name");

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ColumnProfile[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create column profile
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  reportCode: z.string().min(1).max(100),
  profileName: z.string().min(1).max(200),
  columnConfigJson: z.array(z.object({
    key: z.string(),
    visible: z.boolean(),
    order: z.number().int(),
    width: z.number().optional(),
  })),
  isDefault: z.boolean().optional().default(false),
  isShared: z.boolean().optional().default(false),
});

export async function createColumnProfile(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "Permission denied." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const db = createAdminClient();

    const { data: registry } = await db
      .from("erp_report_registry")
      .select("id")
      .eq("report_code", parsed.data.reportCode)
      .maybeSingle();

    if (!registry) {
      return { success: false, error: `Report '${parsed.data.reportCode}' not found.` };
    }

    const reportId = (registry as { id: number }).id;

    if (parsed.data.isDefault) {
      await db
        .from("erp_report_column_profiles")
        .update({ is_default: false })
        .eq("report_id", reportId)
        .eq("user_profile_id", ctx.profile.id);
    }

    const { data, error } = await db
      .from("erp_report_column_profiles")
      .insert({
        report_id: reportId,
        user_profile_id: ctx.profile.id,
        profile_name: parsed.data.profileName,
        column_config_json: parsed.data.columnConfigJson,
        is_default: parsed.data.isDefault,
        is_shared: parsed.data.isShared && hasPermission(ctx, "reports.column_profiles.manage"),
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as { id: number }).id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update column profile
// ─────────────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  id: z.number().int().positive(),
  profileName: z.string().min(1).max(200).optional(),
  columnConfigJson: z.array(z.object({
    key: z.string(),
    visible: z.boolean(),
    order: z.number().int(),
    width: z.number().optional(),
  })).optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

export async function updateColumnProfile(
  input: z.infer<typeof updateSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "Permission denied." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const db = createAdminClient();

    const { data: existing } = await db
      .from("erp_report_column_profiles")
      .select("id, report_id, user_profile_id")
      .eq("id", parsed.data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Column profile not found." };

    const rec = existing as { id: number; report_id: number; user_profile_id: number };
    const isOwner = rec.user_profile_id === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.column_profiles.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "You can only edit your own column profiles." };
    }

    if (parsed.data.isDefault) {
      await db
        .from("erp_report_column_profiles")
        .update({ is_default: false })
        .eq("report_id", rec.report_id)
        .eq("user_profile_id", ctx.profile.id);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.profileName !== undefined) updates.profile_name = parsed.data.profileName;
    if (parsed.data.columnConfigJson !== undefined) updates.column_config_json = parsed.data.columnConfigJson;
    if (parsed.data.isDefault !== undefined) updates.is_default = parsed.data.isDefault;
    if (parsed.data.isShared !== undefined) updates.is_shared = parsed.data.isShared && canManage;

    const { error } = await db
      .from("erp_report_column_profiles")
      .update(updates)
      .eq("id", parsed.data.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete column profile
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteColumnProfile(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "Permission denied." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const db = createAdminClient();

    const { data: existing } = await db
      .from("erp_report_column_profiles")
      .select("id, user_profile_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Column profile not found." };

    const rec = existing as { id: number; user_profile_id: number };
    const isOwner = rec.user_profile_id === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.column_profiles.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "You can only delete your own column profiles." };
    }

    const { error } = await db
      .from("erp_report_column_profiles")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile.id })
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Set default column profile
// ─────────────────────────────────────────────────────────────────────────────

export async function setDefaultColumnProfile(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "Permission denied." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const db = createAdminClient();

    const { data: existing } = await db
      .from("erp_report_column_profiles")
      .select("id, report_id, user_profile_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Column profile not found." };

    const rec = existing as { id: number; report_id: number; user_profile_id: number };

    if (rec.user_profile_id !== ctx.profile.id) {
      return { success: false, error: "You can only set default on your own profiles." };
    }

    await db
      .from("erp_report_column_profiles")
      .update({ is_default: false })
      .eq("report_id", rec.report_id)
      .eq("user_profile_id", ctx.profile.id);

    const { error } = await db
      .from("erp_report_column_profiles")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
