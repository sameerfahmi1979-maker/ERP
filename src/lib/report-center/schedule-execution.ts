/**
 * OUTPUT.7 (WP11) — Shared schedule execution logic.
 *
 * Extracted from `src/server/actions/reports/schedules.ts` so that both the
 * user-facing "Run now" server action and the authenticated internal worker
 * (`/api/internal/report-schedules/process`) execute schedules through the
 * exact same permission-checked, delivery-logged path.
 */

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReport } from "@/lib/report-center/report-runner";
import { getDefaultEmailProviderSystem } from "@/lib/email/providers/factory";
import { generateAttachmentByType } from "@/lib/export/generate-attachment";
import { resolveTemplateForExport } from "@/server/actions/reports/templates";
import type { ERPExportOptions } from "@/lib/export/export-types";
import type { EmailAttachment } from "@/lib/email/email-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ScheduleExecutionResult {
  success: boolean;
  error?: string;
  reportRunId?: number;
  deliveryLogId?: number;
  attachmentFilename?: string;
  attachmentSizeBytes?: number;
  recipientCount?: number;
}

export interface ExecutableSchedule {
  id: number;
  created_by: number;
  owner_company_id: number | null;
  filters_json: Record<string, unknown>;
  selected_template_id: number | null;
  output_format: "pdf" | "excel" | "csv";
  recipient_to: string[];
  recipient_cc: string[] | null;
  email_subject_template: string | null;
  email_body_template: string | null;
  report: {
    id: number;
    report_code: string;
    report_name_en: string;
    required_permissions: string[];
    sensitive_profile: string;
    is_active: boolean;
  };
}

export async function executeScheduleRun(
  sched: ExecutableSchedule,
  permissionCodes: string[]
): Promise<ScheduleExecutionResult> {
  const db = createAdminClient();

  const runResult = await runReport(
    {
      reportCode: sched.report.report_code,
      outputFormat: sched.output_format,
      filters: sched.filters_json,
      templateId: sched.selected_template_id ?? undefined,
      ownerCompanyIds: sched.owner_company_id ? [sched.owner_company_id] : [],
      requestedByUserId: sched.created_by,
    },
    permissionCodes
  );

  if (!runResult.success || !runResult.data) {
    return { success: false, error: runResult.error ?? "Report run failed." };
  }

  const { columns, rows } = runResult.data;

  const exportColumns = columns.map((col) => ({
    key: col,
    header: col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
  const exportData = rows.map((row) =>
    Object.fromEntries(columns.map((col) => [col, row[col] ?? ""]))
  );

  // Resolve report branding from the selected (or run-resolved) template.
  const resolvedTemplateId = sched.selected_template_id ?? runResult.resolvedTemplateId;
  let brandingContext: ERPExportOptions<Record<string, unknown>>["branding"] | undefined;
  if (resolvedTemplateId) {
    try {
      const ctx = await resolveTemplateForExport({
        templateId: resolvedTemplateId,
        reportCode: sched.report.report_code,
        permissionCodes,
      });
      brandingContext = ctx ?? undefined;
    } catch (err) {
      logger.warn(`[schedules] Branding resolve failed for schedule ${sched.id}:`, err);
    }
  }

  const exportOptions: ERPExportOptions<Record<string, unknown>> = {
    title: sched.report.report_name_en,
    filename: `${sched.report.report_code}_${new Date().toISOString().split("T")[0]}`,
    columns: exportColumns,
    data: exportData,
    branding: brandingContext,
  };

  let attachment;
  try {
    attachment = await generateAttachmentByType(sched.output_format, exportOptions);
  } catch (err) {
    return {
      success: false,
      error: `Attachment generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const subject =
    sched.email_subject_template ??
    `${sched.report.report_name_en} — ${new Date().toLocaleDateString("en-GB")}`;
  const body =
    sched.email_body_template ??
    `Dear Recipient,\n\nPlease find attached the scheduled ${sched.report.report_name_en} report.\n\nRegards,\nERP System`;

  // Recipient validation: only well-formed addresses stored on the schedule
  // are ever used; anything else fails the run before any send.
  const toList = [...new Set((sched.recipient_to ?? []).map((e) => e.trim()).filter(Boolean))];
  const ccList = [...new Set((sched.recipient_cc ?? []).map((e) => e.trim()).filter(Boolean))];
  const invalid = [...toList, ...ccList].filter((e) => !EMAIL_RE.test(e));
  if (toList.length === 0 || invalid.length > 0) {
    return {
      success: false,
      error: toList.length === 0 ? "Schedule has no valid recipients." : "Schedule has malformed recipient addresses.",
      reportRunId: runResult.runId ?? undefined,
    };
  }

  const emailResult = await sendScheduleEmail({ to: toList, cc: ccList, subject, body, attachment });

  const { data: deliveryLog } = await db
    .from("erp_report_delivery_logs")
    .insert({
      run_id: runResult.runId ?? null,
      delivery_type: "scheduled_email",
      recipient_to: sched.recipient_to,
      recipient_cc: sched.recipient_cc ?? [],
      subject,
      body_preview: body.substring(0, 200),
      attachment_format: sched.output_format,
      attachment_filename: attachment.filename,
      attachment_size_bytes: attachment.sizeBytes,
      provider: emailResult.provider ?? "erp_provider",
      delivery_status: emailResult.success ? "sent" : "failed",
      success: emailResult.success,
      sent_at: emailResult.success ? new Date().toISOString() : null,
      error_message: emailResult.success ? null : emailResult.error,
      created_by: sched.created_by,
    })
    .select("id")
    .single();

  return {
    success: emailResult.success,
    error: emailResult.success ? undefined : emailResult.error,
    reportRunId: runResult.runId ?? undefined,
    deliveryLogId: (deliveryLog as { id?: number } | null)?.id,
    attachmentFilename: attachment.filename,
    attachmentSizeBytes: attachment.sizeBytes,
    recipientCount: sched.recipient_to.length + (sched.recipient_cc?.length ?? 0),
  };
}

/**
 * OUTPUT.7: session-independent email send for schedule delivery. The
 * previous implementation used the `sendExportEmail` server action, which
 * requires an authenticated user session — impossible for the worker
 * (machine-to-machine), so every automated delivery failed with
 * "Authentication required". Authorization for this path is enforced
 * upstream (WORKER_SECRET + schedule-creator permission validation, or the
 * "Run now" server action's owner/manage check).
 */
async function sendScheduleEmail(input: {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  attachment: EmailAttachment;
}): Promise<{ success: boolean; provider?: string; error?: string }> {
  let provider;
  try {
    provider = await getDefaultEmailProviderSystem();
  } catch (err) {
    return {
      success: false,
      provider: "erp_provider",
      error: err instanceof Error ? err.message : "Email service is not configured.",
    };
  }

  try {
    const result = await provider.sendEmail({
      to: input.to,
      cc: input.cc.length > 0 ? input.cc : undefined,
      subject: input.subject,
      textBody: input.body,
      attachments: [
        {
          filename: input.attachment.filename,
          contentType: input.attachment.contentType,
          base64Content: input.attachment.base64Content,
          sizeBytes: input.attachment.sizeBytes,
        },
      ],
    });
    return {
      success: result.ok,
      provider: provider.config.providerCode,
      error: result.ok ? undefined : result.message,
    };
  } catch (err) {
    return {
      success: false,
      provider: provider.config.providerCode,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getCreatorPermissions(
  db: ReturnType<typeof createAdminClient>,
  userId: number
): Promise<string[]> {
  try {
    // OUTPUT.7 fix: the legacy implementation queried a non-existent
    // `user_role_assignments` table, silently returning [] — which made every
    // scheduled run skip with "creator missing permissions". Role assignments
    // live in `user_roles` (see WP9 company-scope fix).
    const { data } = await db
      .from("user_roles")
      .select("role:roles(role_permissions(permission:permissions(permission_code)))")
      .eq("user_profile_id", userId)
      .eq("is_active", true);

    if (!data) return [];

    const codes = new Set<string>();
    for (const ura of data) {
      const role = (ura as { role?: { role_permissions?: Array<{ permission?: { permission_code?: string } }> } }).role;
      for (const rp of role?.role_permissions ?? []) {
        if (rp.permission?.permission_code) {
          codes.add(rp.permission.permission_code);
        }
      }
    }
    return Array.from(codes);
  } catch {
    return [];
  }
}

// Re-exported for existing callers; implementation lives in the pure core module.
export { calculateNextRunAt } from "@/lib/report-center/schedule-worker-core";
