"use server";

/**
 * Report Designer — Visual Layout Server Actions
 * Phase: REPORT DESIGNER.1 — DB Schema, Layout Standard, Zod Validation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import {
  EMPTY_LAYOUT,
  EDITABLE_GOVERNANCE_STATUSES,
  validateSaveLayoutInput,
  buildLayoutAuditMeta,
  ReportDesignerLayoutJsonSchema,
  SaveVisualLayoutInputSchema,
} from "@/lib/report-designer";
import type {
  ReportDesignerLayoutJson,
  VisualLayoutResult,
  SaveVisualLayoutInput,
} from "@/lib/report-designer";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// getReportTemplateVisualLayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the visual layout JSON for a template, plus governance metadata.
 * Returns EMPTY_LAYOUT defaults for zones that have not been designed yet.
 * Requires: reports.view or reports.manage
 */
export async function getReportTemplateVisualLayout(
  templateId: number
): Promise<ActionResult<VisualLayoutResult>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.view required" };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("erp_report_templates")
      .select(
        "id,template_name,template_type,governance_status,body_layout_json,header_layout_json,footer_layout_json,visual_editor_engine,visual_layout_schema_version,visual_layout_updated_at"
      )
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (error || !data)
      return { success: false, error: error?.message ?? "Template not found" };

    const row = data as {
      id: number;
      template_name: string;
      template_type: string;
      governance_status: string;
      body_layout_json: unknown;
      header_layout_json: unknown;
      footer_layout_json: unknown;
      visual_editor_engine: string | null;
      visual_layout_schema_version: number | null;
      visual_layout_updated_at: string | null;
    };

    const isEditable = (EDITABLE_GOVERNANCE_STATUSES as readonly string[]).includes(
      row.governance_status
    );

    const parseZone = (raw: unknown): ReportDesignerLayoutJson => {
      const parsed = ReportDesignerLayoutJsonSchema.safeParse(raw);
      if (parsed.success && parsed.data.content.length > 0) return parsed.data;
      return EMPTY_LAYOUT;
    };

    return {
      success: true,
      data: {
        templateId: row.id,
        templateName: row.template_name,
        templateType: row.template_type,
        governanceStatus: row.governance_status,
        isEditable,
        bodyLayout: parseZone(row.body_layout_json),
        headerLayout: parseZone(row.header_layout_json),
        footerLayout: parseZone(row.footer_layout_json),
        visualEditorEngine: row.visual_editor_engine ?? "puck",
        visualLayoutSchemaVersion: row.visual_layout_schema_version ?? 1,
        visualLayoutUpdatedAt: row.visual_layout_updated_at ?? null,
      },
    };
  } catch (err) {
    console.error("[report-designer-layout] getReportTemplateVisualLayout:", err);
    return { success: false, error: "Unexpected error loading visual layout" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveReportTemplateVisualLayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save the visual layout JSON for a template.
 *
 * Governance guard: only draft or rejected templates may be edited.
 * Requires: reports.manage
 */
export async function saveReportTemplateVisualLayout(
  input: SaveVisualLayoutInput
): Promise<ActionResult<{ templateId: number }>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.manage required" };
    }

    // Zod + binding validation
    const validation = validateSaveLayoutInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: `Layout validation failed:\n${validation.errors.join("\n")}`,
      };
    }

    const validated = SaveVisualLayoutInputSchema.parse(input);
    const supabase = createAdminClient();

    // Fetch current governance status
    const { data: tpl, error: fetchErr } = await supabase
      .from("erp_report_templates")
      .select("id,governance_status,template_code")
      .eq("id", validated.templateId)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !tpl)
      return { success: false, error: fetchErr?.message ?? "Template not found" };

    const tplRow = tpl as { id: number; governance_status: string; template_code: string };

    // Governance guard
    if (!(EDITABLE_GOVERNANCE_STATUSES as readonly string[]).includes(tplRow.governance_status)) {
      return {
        success: false,
        error: `Template cannot be edited — current status is "${tplRow.governance_status}". Only draft or rejected templates may have their visual layout changed.`,
      };
    }

    const now = new Date().toISOString();
    const actorId = authCtx.profile?.id ?? null;

    const { error: updateErr } = await supabase
      .from("erp_report_templates")
      .update({
        body_layout_json: validated.bodyLayout,
        header_layout_json: validated.headerLayout ?? {},
        footer_layout_json: validated.footerLayout ?? {},
        visual_editor_engine: validated.bodyLayout.engine,
        visual_layout_schema_version: validated.bodyLayout.schemaVersion,
        visual_layout_updated_at: now,
        visual_layout_updated_by: actorId,
        updated_at: now,
        updated_by: actorId,
      })
      .eq("id", validated.templateId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Audit: structural metadata only — never full layout JSON
    const auditMeta = buildLayoutAuditMeta(validated.templateId, validated.bodyLayout);
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: validated.templateId,
      entity_reference: tplRow.template_code,
      action: "visual_layout_saved",
      new_values: auditMeta,
    });

    revalidatePath("/admin/reports/templates");

    return { success: true, data: { templateId: validated.templateId } };
  } catch (err) {
    console.error("[report-designer-layout] saveReportTemplateVisualLayout:", err);
    return { success: false, error: "Unexpected error saving visual layout" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateReportDesignerLayoutAction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side validation of a layout without saving.
 * Requires: reports.view or reports.manage
 */
export async function validateReportDesignerLayoutAction(
  input: unknown
): Promise<ActionResult<{ valid: boolean; errors: string[]; warnings: string[] }>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions" };
    }

    const result = validateSaveLayoutInput(input);

    return {
      success: true,
      data: {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      },
    };
  } catch (err) {
    console.error("[report-designer-layout] validateReportDesignerLayoutAction:", err);
    return { success: false, error: "Unexpected error during validation" };
  }
}
