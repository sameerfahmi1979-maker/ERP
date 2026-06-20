"use server";

/**
 * Global ERP Report Center — Registry Server Actions
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Read actions for the report registry, templates, and branding profiles.
 * Write actions (createReportRegistryEntry, updateReportRegistryEntry) are
 * included and require reports.manage permission.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import type {
  ReportRegistryEntry,
  ReportTemplate,
  ReportBrandingProfile,
} from "@/lib/report-center/types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read actions
// ─────────────────────────────────────────────────────────────────────────────

export async function listReportRegistry(): Promise<
  ActionResult<ReportRegistryEntry[]>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view reports." };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_registry")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("report_name_en");

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ReportRegistryEntry[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getReportRegistryDetail(
  reportCode: string
): Promise<ActionResult<ReportRegistryEntry>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view reports." };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_registry")
      .select("*")
      .eq("report_code", reportCode)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: `Report '${reportCode}' not found.` };
    return { success: true, data: data as ReportRegistryEntry };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listReportTemplates(): Promise<
  ActionResult<ReportTemplate[]>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view reports." };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("template_name");

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ReportTemplate[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listReportBrandingProfiles(): Promise<
  ActionResult<ReportBrandingProfile[]>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view reports." };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_branding_profiles")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("profile_name");

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ReportBrandingProfile[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write actions
// ─────────────────────────────────────────────────────────────────────────────

const createRegistryEntrySchema = z.object({
  report_code: z.string().min(1).max(100).toUpperCase(),
  report_name_en: z.string().min(1).max(200),
  report_name_ar: z.string().max(200).nullable().optional(),
  module_code: z.string().min(1).max(50),
  report_category: z.enum([
    "list", "summary", "detail", "dashboard_snapshot", "letter",
    "certificate", "form", "checklist", "compliance", "audit",
    "export", "badge", "external_submission", "group_summary",
  ]),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  default_template_id: z.number().int().positive().nullable().optional(),
  default_output_formats: z.array(z.enum(["screen","pdf","excel","csv","print","email"])).optional(),
  default_orientation: z.enum(["portrait","landscape"]).optional(),
  branding_strategy: z.enum([
    "auto_by_owner_company","manual_required","group_default","template_fixed","none",
  ]).optional(),
  required_permissions: z.array(z.string()).optional(),
  sensitive_profile: z.enum([
    "normal","payroll","medical","disciplinary","recruitment","dms_confidential","mixed_sensitive",
  ]).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_system: z.boolean().optional(),
});

export type CreateRegistryEntryInput = z.infer<typeof createRegistryEntrySchema>;

export async function createReportRegistryEntry(
  input: CreateRegistryEntryInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage reports." };
    }

    const parsed = createRegistryEntrySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_registry")
      .insert({
        ...parsed.data,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "REPORTS",
      entity_name: "erp_report_registry",
      entity_id: (data as { id: number }).id,
      entity_reference: parsed.data.report_code,
      action: "create",
      new_values: parsed.data,
    });

    revalidatePath("/admin/reports");
    return { success: true, data: { id: (data as { id: number }).id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const updateRegistryEntrySchema = z.object({
  id: z.number().int().positive(),
  report_name_en: z.string().min(1).max(200).optional(),
  report_name_ar: z.string().max(200).nullable().optional(),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  default_template_id: z.number().int().positive().nullable().optional(),
  default_output_formats: z.array(z.enum(["screen","pdf","excel","csv","print","email"])).optional(),
  branding_strategy: z.enum([
    "auto_by_owner_company","manual_required","group_default","template_fixed","none",
  ]).optional(),
  required_permissions: z.array(z.string()).optional(),
  sensitive_profile: z.enum([
    "normal","payroll","medical","disciplinary","recruitment","dms_confidential","mixed_sensitive",
  ]).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateRegistryEntryInput = z.infer<typeof updateRegistryEntrySchema>;

export async function updateReportRegistryEntry(
  input: UpdateRegistryEntryInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage reports." };
    }

    const parsed = updateRegistryEntrySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }

    const { id, ...updates } = parsed.data;

    const db = createAdminClient();
    const { data: existing } = await db
      .from("erp_report_registry")
      .select("report_code")
      .eq("id", id)
      .maybeSingle();

    const { error } = await db
      .from("erp_report_registry")
      .update({ ...updates, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "REPORTS",
      entity_name: "erp_report_registry",
      entity_id: id,
      entity_reference: (existing as { report_code?: string } | null)?.report_code ?? String(id),
      action: "update",
      new_values: updates,
    });

    revalidatePath("/admin/reports");
    return { success: true, data: { id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
