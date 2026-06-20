"use server";

/**
 * Global ERP Report Center — Saved Filters Server Actions
 * Phase: REPORT.5 — Email / Scheduling / Report History / Security UAT
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface SavedFilter {
  id: number;
  report_id: number;
  user_profile_id: number;
  filter_name: string;
  filters_json: Record<string, unknown>;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// List saved filters for a report
// ─────────────────────────────────────────────────────────────────────────────

export async function listSavedFilters(
  reportCode: string
): Promise<ActionResult<SavedFilter[]>> {
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
      .from("erp_report_saved_filters")
      .select("*")
      .eq("report_id", (registry as { id: number }).id)
      .is("deleted_at", null)
      .or(`user_profile_id.eq.${ctx.profile.id},is_shared.eq.true`)
      .order("is_default", { ascending: false })
      .order("filter_name");

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as SavedFilter[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create saved filter
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  reportCode: z.string().min(1).max(100),
  filterName: z.string().min(1).max(200),
  filtersJson: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional().default(false),
  isShared: z.boolean().optional().default(false),
});

export async function createSavedFilter(
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
        .from("erp_report_saved_filters")
        .update({ is_default: false })
        .eq("report_id", reportId)
        .eq("user_profile_id", ctx.profile.id);
    }

    const { data, error } = await db
      .from("erp_report_saved_filters")
      .insert({
        report_id: reportId,
        user_profile_id: ctx.profile.id,
        filter_name: parsed.data.filterName,
        filters_json: parsed.data.filtersJson,
        is_default: parsed.data.isDefault,
        is_shared: parsed.data.isShared && hasPermission(ctx, "reports.saved_filters.manage"),
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/reports");
    return { success: true, data: { id: (data as { id: number }).id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update saved filter
// ─────────────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  id: z.number().int().positive(),
  filterName: z.string().min(1).max(200).optional(),
  filtersJson: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

export async function updateSavedFilter(
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
      .from("erp_report_saved_filters")
      .select("id, report_id, user_profile_id")
      .eq("id", parsed.data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Saved filter not found." };

    const rec = existing as { id: number; report_id: number; user_profile_id: number };
    const isOwner = rec.user_profile_id === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.saved_filters.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "You can only edit your own saved filters." };
    }

    if (parsed.data.isDefault) {
      await db
        .from("erp_report_saved_filters")
        .update({ is_default: false })
        .eq("report_id", rec.report_id)
        .eq("user_profile_id", ctx.profile.id);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.filterName !== undefined) updates.filter_name = parsed.data.filterName;
    if (parsed.data.filtersJson !== undefined) updates.filters_json = parsed.data.filtersJson;
    if (parsed.data.isDefault !== undefined) updates.is_default = parsed.data.isDefault;
    if (parsed.data.isShared !== undefined) {
      updates.is_shared = parsed.data.isShared && canManage;
    }

    const { error } = await db
      .from("erp_report_saved_filters")
      .update(updates)
      .eq("id", parsed.data.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete saved filter
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteSavedFilter(id: number): Promise<ActionResult> {
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
      .from("erp_report_saved_filters")
      .select("id, user_profile_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Saved filter not found." };

    const rec = existing as { id: number; user_profile_id: number };
    const isOwner = rec.user_profile_id === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.saved_filters.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "You can only delete your own saved filters." };
    }

    const { error } = await db
      .from("erp_report_saved_filters")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile.id })
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Set default saved filter
// ─────────────────────────────────────────────────────────────────────────────

export async function setDefaultSavedFilter(id: number): Promise<ActionResult> {
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
      .from("erp_report_saved_filters")
      .select("id, report_id, user_profile_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Saved filter not found." };

    const rec = existing as { id: number; report_id: number; user_profile_id: number };

    if (rec.user_profile_id !== ctx.profile.id) {
      return { success: false, error: "You can only set default on your own filters." };
    }

    await db
      .from("erp_report_saved_filters")
      .update({ is_default: false })
      .eq("report_id", rec.report_id)
      .eq("user_profile_id", ctx.profile.id);

    const { error } = await db
      .from("erp_report_saved_filters")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
