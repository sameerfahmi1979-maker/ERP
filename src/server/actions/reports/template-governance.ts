"use server";

/**
 * Template Governance Server Actions — BRANDING.7
 *
 * Lifecycle management for erp_report_templates:
 *   submitTemplateForReview, approveTemplate, rejectTemplate,
 *   publishTemplate, archiveTemplate, createTemplateDraftVersion,
 *   getTemplateGovernanceHistory, runTemplateSecurityReviewAction
 *
 * Permission model:
 *   reports.manage            — create/edit drafts, submit for review
 *   reports.template.approve  — approve/reject/publish
 *   reports.publish           — publish approved templates, issue QR links
 *   reports.view              — read governance history
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import type {
  ReportTemplate,
  ReportTemplateEvent,
  TemplateGovernanceStatus,
  TemplateSecurityReviewStatus,
  TemplateEventType,
} from "@/lib/report-center/types";
import {
  runTemplateSecurityReview,
  type SecurityReviewResult,
} from "@/lib/template-governance/security-review";
import { getRestrictedFieldsFromPaths } from "@/lib/report-designer/field-registry";
import { createNotification } from "@/server/actions/notifications/notifications";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses that allow official formal issuance / public QR links */
const ISSUABLE_STATUSES: TemplateGovernanceStatus[] = ["approved", "published"];

/** Statuses that prevent use for any new output */
const UNUSABLE_STATUSES: TemplateGovernanceStatus[] = ["archived", "rejected"];

async function insertTemplateEvent(
  db: ReturnType<typeof createAdminClient>,
  templateId: number,
  eventType: TemplateEventType,
  actorId: number | null,
  payload: Record<string, unknown> = {},
  notes?: string
): Promise<void> {
  await db.from("erp_report_template_events").insert({
    template_id: templateId,
    event_type: eventType,
    actor_user_profile_id: actorId,
    payload_json: payload,
    notes: notes ?? null,
  });
}

function revalidateTemplates() {
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/templates");
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit for review
// ─────────────────────────────────────────────────────────────────────────────

export async function submitTemplateForReview(
  templateId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage report templates." };
    }

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("id, template_code, template_name, template_type, governance_status, body_html_en, body_html_ar, custom_css, watermark_text, visual_editor_engine, visual_layout_schema_version, header_layout_json, body_layout_json, footer_layout_json, style_json")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };
    if (tpl.governance_status !== "draft" && tpl.governance_status !== "rejected") {
      return { success: false, error: `Template is in '${tpl.governance_status}' status and cannot be submitted for review.` };
    }

    // Run security review automatically on submission (legacy HTML + visual layout)
    const review = runTemplateSecurityReview({
      body_html_en: tpl.body_html_en,
      body_html_ar: tpl.body_html_ar,
      custom_css: tpl.custom_css,
      watermark_text: tpl.watermark_text,
      visual_editor_engine: tpl.visual_editor_engine,
      visual_layout_schema_version: tpl.visual_layout_schema_version,
      header_layout_json: tpl.header_layout_json,
      body_layout_json: tpl.body_layout_json,
      footer_layout_json: tpl.footer_layout_json,
      style_json: tpl.style_json,
      // UX.3: pass template_type for governance-aware sensitive field check
      template_type: tpl.template_type,
    });

    const secStatus: TemplateSecurityReviewStatus = review.passed
      ? review.severity === "none"
        ? "passed"
        : "passed" // warnings don't block submission
      : "failed";

    const secNotes =
      review.findings.length > 0
        ? review.findings
            .map((f) => `[${f.severity.toUpperCase()}] ${f.field}: ${f.rule} — "${f.excerpt}"`)
            .join("\n")
        : null;

    if (!review.passed) {
      // Update security review status but do NOT advance governance_status
      await db.from("erp_report_templates").update({
        security_review_status: "failed",
        security_review_notes: secNotes,
        security_review_at: new Date().toISOString(),
        security_review_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      }).eq("id", templateId);

      await insertTemplateEvent(db, templateId, "template_security_review_failed", ctx.profile?.id ?? null, {
        findings_count: review.findings.length,
        severity: review.severity,
      });

      return {
        success: false,
        error: `Template failed security review (${review.findings.length} finding${review.findings.length !== 1 ? "s" : ""}). Fix the issues before resubmitting.`,
        data: { review } as unknown,
      };
    }

    const { error: updateError } = await db
      .from("erp_report_templates")
      .update({
        governance_status: "in_review",
        submitted_at: new Date().toISOString(),
        submitted_by: ctx.profile?.id ?? null,
        security_review_status: secStatus,
        security_review_notes: secNotes,
        security_review_at: new Date().toISOString(),
        security_review_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", templateId);

    if (updateError) return { success: false, error: updateError.message };

    await insertTemplateEvent(db, templateId, "template_submitted_for_review", ctx.profile?.id ?? null, {
      security_review_status: secStatus,
      findings_count: review.findings.length,
    });

    if (review.severity === "none" || secStatus === "passed") {
      await insertTemplateEvent(db, templateId, "template_security_review_passed", ctx.profile?.id ?? null, {
        severity: review.severity,
      });
    }

    // BRANDING.8: Notify approvers via erp_notifications
    // Fire-and-forget — do not fail the submission if notification fails
    createNotification({
      source_module: "REPORTS",
      source_entity_type: "erp_report_templates",
      source_entity_id: templateId,
      notification_type: "template_submitted_for_review",
      severity: "info",
      title: "Template Ready for Review",
      message: `Template "${tpl.template_name}" (${tpl.template_code}) has been submitted for approval review.`,
      recipient_role_code: "system_admin",
      channel_in_app: true,
      channel_email: false,
      action_url: `/admin/reports/templates/governance`,
      action_label: "Open Governance Queue",
      notification_code: `TEMPLATE_REVIEW_${templateId}`,
      metadata_json: {
        template_id: templateId,
        template_code: tpl.template_code,
        security_review_status: secStatus,
      },
    }).catch(() => {
      // Notification failure must not block submission
    });

    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: templateId,
      entity_reference: tpl.template_code,
      action: "update",
      new_values: { governance_status: "in_review" },
    });

    revalidateTemplates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Approve template
// ─────────────────────────────────────────────────────────────────────────────

const approveSchema = z.object({
  templateId: z.number().int().positive(),
  notes: z.string().max(2000).optional(),
});

export async function approveTemplate(
  input: z.infer<typeof approveSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.template.approve")) {
      return { success: false, error: "You do not have permission to approve report templates." };
    }
    const parsed = approveSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    const { templateId, notes } = parsed.data;

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("id, template_code, template_type, governance_status, security_review_status, security_review_notes, header_layout_json, body_layout_json, footer_layout_json")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };
    if (tpl.governance_status !== "in_review") {
      return { success: false, error: `Template must be 'in_review' to be approved. Current status: '${tpl.governance_status}'.` };
    }
    if (tpl.security_review_status === "failed") {
      return { success: false, error: "Template has a failed security review. Resolve security findings before approving." };
    }

    // UX.3: Enforce reports.sensitive_fields.approve if template uses restricted/confidential fields
    const reviewNotes = (tpl.security_review_notes as string | null) ?? "";
    const hasSensitiveWarnings =
      reviewNotes.includes("restricted_field_elevated_approval_required") ||
      reviewNotes.includes("sensitive_fields_require_elevated_approval");
    if (hasSensitiveWarnings && !hasPermission(ctx, "reports.sensitive_fields.approve")) {
      return {
        success: false,
        error: "This template uses restricted/confidential fields. You need the 'reports.sensitive_fields.approve' permission to approve it.",
      };
    }

    const { error } = await db.from("erp_report_templates").update({
      governance_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: ctx.profile?.id ?? null,
      approval_notes: notes ?? null,
      updated_by: ctx.profile?.id ?? null,
    }).eq("id", templateId);

    if (error) return { success: false, error: error.message };

    await insertTemplateEvent(db, templateId, "template_approved", ctx.profile?.id ?? null, {}, notes);
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: templateId,
      entity_reference: tpl.template_code,
      action: "update",
      new_values: { governance_status: "approved", approval_notes: notes },
    });

    revalidateTemplates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reject template
// ─────────────────────────────────────────────────────────────────────────────

const rejectSchema = z.object({
  templateId: z.number().int().positive(),
  reason: z.string().min(5).max(2000),
});

export async function rejectTemplate(
  input: z.infer<typeof rejectSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.template.approve")) {
      return { success: false, error: "You do not have permission to reject report templates." };
    }
    const parsed = rejectSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    const { templateId, reason } = parsed.data;

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("id, template_code, governance_status")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };
    if (tpl.governance_status !== "in_review") {
      return { success: false, error: `Template must be 'in_review' to be rejected. Current status: '${tpl.governance_status}'.` };
    }

    const { error } = await db.from("erp_report_templates").update({
      governance_status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_by: ctx.profile?.id ?? null,
      rejection_reason: reason,
      updated_by: ctx.profile?.id ?? null,
    }).eq("id", templateId);

    if (error) return { success: false, error: error.message };

    await insertTemplateEvent(db, templateId, "template_rejected", ctx.profile?.id ?? null, {}, reason);
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: templateId,
      entity_reference: tpl.template_code,
      action: "update",
      new_values: { governance_status: "rejected", rejection_reason: reason },
    });

    revalidateTemplates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish template
// ─────────────────────────────────────────────────────────────────────────────

export async function publishTemplate(templateId: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.publish") && !hasPermission(ctx, "reports.template.approve")) {
      return { success: false, error: "You do not have permission to publish report templates." };
    }

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("id, template_code, template_type, governance_status, security_review_notes, parent_template_id, version_no")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };
    if (tpl.governance_status !== "approved") {
      return { success: false, error: `Template must be 'approved' before publishing. Current status: '${tpl.governance_status}'.` };
    }

    // UX.3: Enforce reports.sensitive_fields.approve at publish step too
    const reviewNotes = (tpl.security_review_notes as string | null) ?? "";
    const hasSensitiveWarnings =
      reviewNotes.includes("restricted_field_elevated_approval_required") ||
      reviewNotes.includes("sensitive_fields_require_elevated_approval");
    if (hasSensitiveWarnings && !hasPermission(ctx, "reports.sensitive_fields.approve")) {
      return {
        success: false,
        error: "This template uses restricted/confidential fields. You need the 'reports.sensitive_fields.approve' permission to publish it.",
      };
    }

    const now = new Date().toISOString();
    const actorId = ctx.profile?.id ?? null;

    const { error } = await db.from("erp_report_templates").update({
      governance_status: "published",
      published_at: now,
      published_by: actorId,
      updated_by: actorId,
    }).eq("id", templateId);

    if (error) return { success: false, error: error.message };

    await insertTemplateEvent(db, templateId, "template_published", actorId);
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: templateId,
      entity_reference: tpl.template_code,
      action: "update",
      new_values: { governance_status: "published" },
    });

    // GOVERNANCE.1: When a revision is published, auto-archive its parent template.
    // This ensures only one active published version exists per template lineage.
    const parentId = (tpl as { parent_template_id: number | null }).parent_template_id;
    if (parentId) {
      const { data: parentTpl } = await db
        .from("erp_report_templates")
        .select("id, template_code, governance_status")
        .eq("id", parentId)
        .is("deleted_at", null)
        .single();

      if (parentTpl && parentTpl.governance_status !== "archived") {
        await db.from("erp_report_templates").update({
          governance_status: "archived",
          archived_at: now,
          archived_by: actorId,
          archive_reason: `Superseded by revision v${(tpl as { version_no: number }).version_no} (template ID ${templateId})`,
          is_active: false,
          updated_by: actorId,
        }).eq("id", parentId);

        await insertTemplateEvent(
          db,
          parentId,
          "template_archived",
          actorId,
          { superseded_by_template_id: templateId, superseded_by_version_no: (tpl as { version_no: number }).version_no },
          `Superseded by revision v${(tpl as { version_no: number }).version_no} (ID ${templateId})`
        );

        await logAudit({
          module_code: "reports",
          entity_name: "erp_report_templates",
          entity_id: parentId,
          entity_reference: parentTpl.template_code,
          action: "update",
          new_values: {
            governance_status: "archived",
            archive_reason: `Superseded by revision v${(tpl as { version_no: number }).version_no} (template ID ${templateId})`,
          },
        });
      }
    }

    revalidateTemplates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive template
// ─────────────────────────────────────────────────────────────────────────────

const archiveSchema = z.object({
  templateId: z.number().int().positive(),
  reason: z.string().max(2000).optional(),
});

export async function archiveTemplate(
  input: z.infer<typeof archiveSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage") && !hasPermission(ctx, "reports.template.approve")) {
      return { success: false, error: "You do not have permission to archive report templates." };
    }
    const parsed = archiveSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    const { templateId, reason } = parsed.data;

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("id, template_code, governance_status")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };
    if (tpl.governance_status === "archived") {
      return { success: false, error: "Template is already archived." };
    }

    const { error } = await db.from("erp_report_templates").update({
      governance_status: "archived",
      archived_at: new Date().toISOString(),
      archived_by: ctx.profile?.id ?? null,
      archive_reason: reason ?? null,
      is_active: false,
      updated_by: ctx.profile?.id ?? null,
    }).eq("id", templateId);

    if (error) return { success: false, error: error.message };

    await insertTemplateEvent(db, templateId, "template_archived", ctx.profile?.id ?? null, {}, reason);
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: templateId,
      entity_reference: tpl.template_code,
      action: "update",
      new_values: { governance_status: "archived", archive_reason: reason },
    });

    revalidateTemplates();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create new draft version from an existing approved/published template
// ─────────────────────────────────────────────────────────────────────────────

export async function createTemplateDraftVersion(
  templateId: number
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage report templates." };
    }

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("*")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };

    const source = tpl as ReportTemplate;
    const unusable = UNUSABLE_STATUSES as string[];
    if (unusable.includes(source.governance_status ?? "draft")) {
      return {
        success: false,
        error: `Cannot create a new version from an '${source.governance_status}' template.`,
      };
    }

    const { data: newTpl, error: insertError } = await db
      .from("erp_report_templates")
      .insert({
        // Copy all content fields
        template_code: `${source.template_code}_V${(source.version_no ?? 1) + 1}`,
        template_name: `${source.template_name} (v${(source.version_no ?? 1) + 1})`,
        template_type: source.template_type,
        branding_profile_id: source.branding_profile_id,
        default_orientation: source.default_orientation,
        page_size: source.page_size,
        font_family: source.font_family,
        language_mode: source.language_mode,
        show_logo: source.show_logo,
        show_small_logo: source.show_small_logo,
        show_address: source.show_address,
        show_trn: source.show_trn,
        show_license: source.show_license,
        show_signatory: source.show_signatory,
        show_stamp: source.show_stamp,
        show_watermark: source.show_watermark,
        requires_stamp_permission: source.requires_stamp_permission,
        watermark_text: source.watermark_text,
        body_html_en: source.body_html_en,
        body_html_ar: source.body_html_ar,
        custom_css: source.custom_css,
        header_layout_json: source.header_layout_json,
        footer_layout_json: source.footer_layout_json,
        body_layout_json: source.body_layout_json,
        style_json: source.style_json,
        // Visual editor fields — preserve layout engine and version for new draft
        visual_editor_engine: source.visual_editor_engine ?? null,
        visual_layout_schema_version: source.visual_layout_schema_version ?? null,
        // visual_layout_updated_at/by reset to null — the copy is fresh
        visual_layout_updated_at: null,
        visual_layout_updated_by: null,
        // Governance reset for the new draft
        version_no: (source.version_no ?? 1) + 1,
        parent_template_id: templateId,
        governance_status: "draft",
        security_review_status: "pending",
        is_default: false,
        is_active: true,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (insertError || !newTpl) return { success: false, error: insertError?.message ?? "Failed to create draft version." };

    await insertTemplateEvent(db, newTpl.id, "template_created", ctx.profile?.id ?? null, {
      copied_from_id: templateId,
      version_no: (source.version_no ?? 1) + 1,
    });
    await insertTemplateEvent(db, newTpl.id, "template_new_version_created", ctx.profile?.id ?? null, {
      parent_template_id: templateId,
      parent_governance_status: source.governance_status,
    });

    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: newTpl.id,
      entity_reference: `${source.template_code}_V${(source.version_no ?? 1) + 1}`,
      action: "create",
      new_values: { parent_template_id: templateId, version_no: (source.version_no ?? 1) + 1 },
    });

    revalidateTemplates();
    return { success: true, data: { id: newTpl.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance history
// ─────────────────────────────────────────────────────────────────────────────

export async function getTemplateGovernanceHistory(
  templateId: number
): Promise<ActionResult<ReportTemplateEvent[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view report templates." };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_template_events")
      .select("*")
      .eq("template_id", templateId)
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ReportTemplateEvent[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// On-demand security review (can be run before submission)
// ─────────────────────────────────────────────────────────────────────────────

export async function runTemplateSecurityReviewAction(
  templateId: number
): Promise<ActionResult<SecurityReviewResult>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage") && !hasPermission(ctx, "reports.template.approve")) {
      return { success: false, error: "You do not have permission to review report templates." };
    }

    const db = createAdminClient();
    const { data: tpl, error: fetchError } = await db
      .from("erp_report_templates")
      .select("id, template_code, template_type, body_html_en, body_html_ar, custom_css, watermark_text, visual_editor_engine, visual_layout_schema_version, header_layout_json, body_layout_json, footer_layout_json, style_json")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !tpl) return { success: false, error: "Template not found." };

    const review = runTemplateSecurityReview({
      body_html_en: tpl.body_html_en,
      body_html_ar: tpl.body_html_ar,
      custom_css: tpl.custom_css,
      watermark_text: tpl.watermark_text,
      visual_editor_engine: tpl.visual_editor_engine,
      visual_layout_schema_version: tpl.visual_layout_schema_version,
      header_layout_json: tpl.header_layout_json,
      body_layout_json: tpl.body_layout_json,
      footer_layout_json: tpl.footer_layout_json,
      style_json: tpl.style_json,
      // UX.3: pass template_type for governance-aware sensitive field check
      template_type: tpl.template_type,
    });

    const secStatus: TemplateSecurityReviewStatus = review.passed
      ? "passed"
      : "failed";

    const secNotes =
      review.findings.length > 0
        ? review.findings
            .map((f) => `[${f.severity.toUpperCase()}] ${f.field}: ${f.rule} — "${f.excerpt}"`)
            .join("\n")
        : null;

    await db.from("erp_report_templates").update({
      security_review_status: secStatus,
      security_review_notes: secNotes,
      security_review_at: new Date().toISOString(),
      security_review_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    }).eq("id", templateId);

    const eventType: TemplateEventType = review.passed
      ? "template_security_review_passed"
      : "template_security_review_failed";

    await insertTemplateEvent(db, templateId, eventType, ctx.profile?.id ?? null, {
      findings_count: review.findings.length,
      severity: review.severity,
    });

    revalidateTemplates();
    return { success: true, data: review };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance summary (for governance dashboard — BRANDING.8)
// ─────────────────────────────────────────────────────────────────────────────

export interface GovernanceSummary {
  counts: Record<string, number>;
  inReviewTemplates: Partial<ReportTemplate>[];
  failedSecurityReviewTemplates: Partial<ReportTemplate>[];
}

export async function getGovernanceSummary(): Promise<ActionResult<GovernanceSummary>> {
  try {
    const ctx = await getAuthContext();
    if (
      !hasPermission(ctx, "reports.view") &&
      !hasPermission(ctx, "reports.manage") &&
      !hasPermission(ctx, "reports.template.approve")
    ) {
      return { success: false, error: "You do not have permission to view governance summary." };
    }

    const db = createAdminClient();

    const { data: allTemplates, error } = await db
      .from("erp_report_templates")
      .select("id, template_code, template_name, template_type, governance_status, security_review_status, version_no, submitted_at, approved_at, rejected_at, rejection_reason, security_review_notes")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = (allTemplates ?? []) as Partial<ReportTemplate>[];

    const counts: Record<string, number> = {
      draft: 0,
      in_review: 0,
      approved: 0,
      published: 0,
      rejected: 0,
      archived: 0,
    };
    for (const t of rows) {
      const s = (t.governance_status ?? "draft") as string;
      counts[s] = (counts[s] ?? 0) + 1;
    }

    const inReviewTemplates = rows.filter((t) => t.governance_status === "in_review");
    const failedSecurityReviewTemplates = rows.filter(
      (t) => t.security_review_status === "failed" && t.governance_status !== "archived"
    );

    return {
      success: true,
      data: { counts, inReviewTemplates, failedSecurityReviewTemplates },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkTemplateIsIssuable(
  templateId: number
): Promise<{ isIssuable: boolean; governanceStatus: string | null; error?: string }> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .select("id, governance_status")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return { isIssuable: false, governanceStatus: null, error: "Template not found." };
    }

    const status = data.governance_status as TemplateGovernanceStatus;
    const isIssuable = ISSUABLE_STATUSES.includes(status);
    return { isIssuable, governanceStatus: status };
  } catch (e) {
    return { isIssuable: false, governanceStatus: null, error: e instanceof Error ? e.message : String(e) };
  }
}
