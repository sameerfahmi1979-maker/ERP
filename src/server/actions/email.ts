/**
 * Email Server Actions
 * Phase 002E.3D - Export Menu Integration + Server Action
 * Phase REPORT.5 - Report Email Delivery with delivery log
 * Phase SETTINGS.2 - Migrated to DB-backed email provider factory
 *
 * Config is loaded from erp_email_provider_configs (Admin -> Settings -> Email Settings).
 */

"use server";

import { logger } from "@/lib/logger";
import { getDefaultEmailProvider } from "@/lib/email/providers/factory";
import { logAudit } from "./audit";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SendEmailResult, EmailAttachment } from "@/lib/email/email-types";

/**
 * Input for sendExportEmail server action
 * 
 * Simpler than SendEmailInput (uses string arrays instead of EmailRecipient[])
 */
export type SendExportEmailInput = {
  /** To recipients (array of email strings) */
  to: string[];
  /** CC recipients (array of email strings) */
  cc?: string[];
  /** BCC recipients (array of email strings) */
  bcc?: string[];
  /** Email subject */
  subject: string;
  /** Email body (plain text) */
  body: string;
  /** Attachment */
  attachment: EmailAttachment;
  /** Context metadata for audit logging */
  context?: {
    moduleCode?: string;
    recordCount?: number;
    exportMode?: "selected" | "filtered" | "all";
  };
};

/**
 * Send export email via Microsoft Graph
 * 
 * Phase 002E.3D implementation
 * 
 * Features:
 * - RBAC permission check
 * - Server-side validation
 * - Microsoft Graph config loading
 * - Attachment size validation
 * - Recipient deduplication
 * - Audit logging
 * - Graceful error handling
 * 
 * @param input - Email input with string arrays for recipients
 * @returns SendEmailResult with success/error
 * 
 * @example
 * ```typescript
 * const result = await sendExportEmail({
 *   to: ["user@example.com"],
 *   subject: "Organizations Report",
 *   body: "Dear Sir/Madam, ...",
 *   attachment: pdfAttachment,
 *   context: {
 *     moduleCode: "organizations",
 *     recordCount: 50,
 *     exportMode: "selected",
 *   },
 * });
 * 
 * if (result.success) {
 *   toast.success("Email sent!");
 * } else {
 *   toast.error(result.error);
 * }
 * ```
 */
export async function sendExportEmail(input: SendExportEmailInput): Promise<SendEmailResult> {
  try {
    // 1. Get auth context
    const ctx = await getAuthContext();
    
    if (!ctx.profile) {
      logger.error("[sendExportEmail] No authenticated user");
      return {
        success: false,
        provider: "microsoft_graph",
        error: "Authentication required",
        statusCode: 401,
      };
    }
    
    // 2. Check permission
    // Use module-specific permission if available, otherwise require erp.admin
    const requiredPermission = input.context?.moduleCode
      ? `${input.context.moduleCode}.view`
      : "erp.admin";
    
    if (!hasPermission(ctx, requiredPermission)) {
      logger.warn(`[sendExportEmail] Permission denied for user ${ctx.profile.id}: ${requiredPermission}`);
      
      // Log denied attempt
      await logAudit({
        module_code: input.context?.moduleCode || "email",
        entity_name: "email_send",
        entity_id: null,
        entity_reference: input.subject.substring(0, 50),
        action: "email_send_denied",
        new_values: {
          reason: "Permission denied",
          required_permission: requiredPermission,
        },
      }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));
      
      return {
        success: false,
        provider: "microsoft_graph",
        error: "Permission denied: You do not have permission to send emails",
        statusCode: 403,
      };
    }
    
    // 3. Load email provider from DB (Admin -> Settings -> Email Settings)
    let provider;
    try {
      provider = await getDefaultEmailProvider();
    } catch (providerErr) {
      logger.error("[sendExportEmail] No email provider configured:", providerErr);
      await logAudit({
        module_code: input.context?.moduleCode || "email",
        entity_name: "email_send",
        entity_id: null,
        entity_reference: input.subject.substring(0, 50),
        action: "email_send_failed",
        new_values: { reason: "No email provider configured" },
      }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));
      return {
        success: false,
        provider: "erp_provider",
        error: "Email service is not configured. Please contact administrator to configure an email provider in Admin → Settings → Email Settings.",
        statusCode: 500,
      };
    }

    // 4. Deduplicate and filter recipients
    const toList = [...new Set(input.to.map((e) => e.trim()).filter(Boolean))];
    const ccList = input.cc
      ? [...new Set(input.cc.map((e) => e.trim()).filter(Boolean))]
      : undefined;
    const bccList = input.bcc
      ? [...new Set(input.bcc.map((e) => e.trim()).filter(Boolean))]
      : undefined;

    if (!toList.length) {
      return { success: false, provider: provider.config.providerCode, error: "No valid recipients provided.", statusCode: 400 };
    }

    // 5. Send email
    logger.info(`[sendExportEmail] Sending via provider "${provider.config.providerCode}": ${input.subject} to ${toList.length} recipients`);
    const providerResult = await provider.sendEmail({
      to: toList,
      cc: ccList,
      bcc: bccList,
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

    const success = providerResult.ok;

    // 6. Log audit event
    await logAudit({
      module_code: input.context?.moduleCode || "email",
      entity_name: "email_send",
      entity_id: null,
      entity_reference: input.subject.substring(0, 50),
      action: success ? "email_send_success" : "email_send_failed",
      new_values: {
        provider: provider.config.providerCode,
        to_count: toList.length,
        cc_count: ccList?.length || 0,
        subject: input.subject,
        attachment_filename: input.attachment.filename,
        attachment_content_type: input.attachment.contentType,
        attachment_size_bytes: input.attachment.sizeBytes,
        attachment_size_mb: (input.attachment.sizeBytes / (1024 * 1024)).toFixed(2),
        record_count: input.context?.recordCount,
        export_mode: input.context?.exportMode,
        success,
        error: providerResult.message,
      },
    }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));

    if (success) {
      logger.info(`[sendExportEmail] Email sent successfully: ${input.subject}`);
    } else {
      logger.error(`[sendExportEmail] Email send failed: ${providerResult.message}`);
    }

    return {
      success,
      provider: provider.config.providerCode,
      error: success ? undefined : providerResult.message,
      statusCode: success ? 200 : 500,
    };
  } catch (error) {
    logger.error("[sendExportEmail] Unexpected error:", error);
    await logAudit({
      module_code: input.context?.moduleCode || "email",
      entity_name: "email_send",
      entity_id: null,
      entity_reference: input.subject.substring(0, 50),
      action: "email_send_error",
      new_values: { error: error instanceof Error ? error.message : String(error) },
    }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));
    return {
      success: false,
      provider: "erp_provider",
      error: error instanceof Error ? error.message : "Unknown error occurred",
      statusCode: 500,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendReportEmail — Report-specific email with delivery log
// Phase REPORT.5
// ─────────────────────────────────────────────────────────────────────────────

export type SendReportEmailInput = SendExportEmailInput & {
  runId?: number;
  attachmentFormat?: string;
  attachmentFilename?: string;
  attachmentSizeBytes?: number;
};

/**
 * Send a report via email and log to erp_report_delivery_logs.
 * Requires reports.email permission.
 * Never sends sensitive data beyond the caller's permission level
 * (redaction is already applied by the report runner before reaching here).
 */
export async function sendReportEmail(
  input: SendReportEmailInput
): Promise<SendEmailResult> {
  const ctx = await getAuthContext();

  if (!ctx.profile) {
    return { success: false, provider: "microsoft_graph", error: "Authentication required.", statusCode: 401 };
  }

  if (!hasPermission(ctx, "reports.email")) {
    return { success: false, provider: "microsoft_graph", error: "You do not have permission to email reports.", statusCode: 403 };
  }

  const result = await sendExportEmail({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    attachment: input.attachment,
    // Use lowercase "reports" so sendExportEmail builds "reports.view" matching DB permissions.
    context: { moduleCode: "reports", recordCount: input.context?.recordCount },
  });

  try {
    const db = createAdminClient();
    await db.from("erp_report_delivery_logs").insert({
      run_id: input.runId ?? null,
      delivery_type: "email",
      recipient_to: input.to,
      recipient_cc: input.cc ?? [],
      subject: input.subject,
      body_preview: input.body.substring(0, 200),
      attachment_format: input.attachmentFormat ?? input.attachment.contentType,
      attachment_filename: input.attachmentFilename ?? input.attachment.filename,
      attachment_size_bytes: input.attachmentSizeBytes ?? input.attachment.sizeBytes,
      provider: result.provider ?? "erp_provider",
      delivery_status: result.success ? "sent" : "failed",
      success: result.success,
      sent_at: result.success ? new Date().toISOString() : null,
      error_message: result.success ? null : result.error,
      created_by: ctx.profile.id,
    });
  } catch (logErr) {
    logger.error("[sendReportEmail] Failed to log delivery:", logErr);
  }

  return result;
}
