/**
 * Email Server Actions
 * Phase 002E.3D - Export Menu Integration + Server Action
 * Phase REPORT.5 - Report Email Delivery with delivery log
 *
 * Server-only actions for sending emails via Microsoft Graph
 */

"use server";

import { getMicrosoftGraphConfig } from "@/lib/email/microsoft-graph-config";
import { logger } from "@/lib/logger";
import { MicrosoftGraphProvider } from "@/lib/email/microsoft-graph-provider";
import { parseEmailList, deduplicateRecipients, validateSendEmailInput } from "@/lib/email/email-validation";
import { logAudit } from "./audit";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SendEmailInput, SendEmailResult, EmailRecipient, EmailAttachment } from "@/lib/email/email-types";

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
    
    // 3. Load Microsoft Graph config
    const configResult = getMicrosoftGraphConfig();
    if (!configResult.configured) {
      logger.error("[sendExportEmail] Microsoft Graph not configured. Missing:", configResult.missing);
      
      // Log configuration error
      await logAudit({
        module_code: input.context?.moduleCode || "email",
        entity_name: "email_send",
        entity_id: null,
        entity_reference: input.subject.substring(0, 50),
        action: "email_send_failed",
        new_values: {
          reason: "Microsoft Graph not configured",
          // Do NOT log missing env var names (security)
        },
      }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));
      
      return {
        success: false,
        provider: "microsoft_graph",
        error: "Email service is not configured. Please contact administrator.",
        statusCode: 500,
      };
    }
    
    const graphConfig = configResult.config!;
    
    // 4. Convert string arrays to EmailRecipient arrays
    const toRecipients: EmailRecipient[] = input.to
      .filter((email) => email && email.trim())
      .map((email) => ({ email: email.trim() }));
    
    const ccRecipients: EmailRecipient[] | undefined = input.cc
      ? input.cc
          .filter((email) => email && email.trim())
          .map((email) => ({ email: email.trim() }))
      : undefined;
    
    const bccRecipients: EmailRecipient[] | undefined = input.bcc
      ? input.bcc
          .filter((email) => email && email.trim())
          .map((email) => ({ email: email.trim() }))
      : undefined;
    
    // 5. Build SendEmailInput
    const emailInput: SendEmailInput = {
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject: input.subject,
      body: input.body,
      bodyFormat: "text",
      attachments: [input.attachment],
      saveToSentItems: graphConfig.saveToSentItems,
    };
    
    // 6. Validate input (server-side validation)
    const validation = validateSendEmailInput(emailInput, graphConfig);
    if (!validation.valid) {
      logger.warn("[sendExportEmail] Validation failed:", validation.errors);
      
      // Log validation failure
      await logAudit({
        module_code: input.context?.moduleCode || "email",
        entity_name: "email_send",
        entity_id: null,
        entity_reference: input.subject.substring(0, 50),
        action: "email_send_validation_failed",
        new_values: {
          errors: validation.errors,
        },
      }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));
      
      return {
        success: false,
        provider: "microsoft_graph",
        error: validation.errors.join(", "),
        statusCode: 400,
      };
    }
    
    // 7. Deduplicate recipients
    const deduplicatedInput = deduplicateRecipients(emailInput);
    
    // 8. Initialize Microsoft Graph provider
    const provider = new MicrosoftGraphProvider(graphConfig);
    
    // 9. Send email
    logger.info(`[sendExportEmail] Sending email: ${input.subject} to ${deduplicatedInput.to.length} recipients`);
    const result = await provider.sendEmail(deduplicatedInput);
    
    // 10. Log audit event
    await logAudit({
      module_code: input.context?.moduleCode || "email",
      entity_name: "email_send",
      entity_id: null,
      entity_reference: input.subject.substring(0, 50),
      action: result.success ? "email_send_success" : "email_send_failed",
      new_values: {
        provider: "microsoft_graph",
        to_count: deduplicatedInput.to.length,
        cc_count: deduplicatedInput.cc?.length || 0,
        bcc_count: deduplicatedInput.bcc?.length || 0,
        subject: input.subject,
        attachment_filename: input.attachment.filename,
        attachment_content_type: input.attachment.contentType,
        attachment_size_bytes: input.attachment.sizeBytes,
        attachment_size_mb: (input.attachment.sizeBytes / (1024 * 1024)).toFixed(2),
        record_count: input.context?.recordCount,
        export_mode: input.context?.exportMode,
        success: result.success,
        error: result.error,
        status_code: result.statusCode,
        graph_error_code: result.graphErrorCode,
      },
    }).catch((err) => {
      // Audit failure should not fail email send
      logger.error("[sendExportEmail] Audit log failed:", err);
    });
    
    if (result.success) {
      logger.info(`[sendExportEmail] Email sent successfully: ${input.subject}`);
    } else {
      logger.error(`[sendExportEmail] Email send failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    logger.error("[sendExportEmail] Unexpected error:", error);
    
    // Log unexpected error
    await logAudit({
      module_code: input.context?.moduleCode || "email",
      entity_name: "email_send",
      entity_id: null,
      entity_reference: input.subject.substring(0, 50),
      action: "email_send_error",
      new_values: {
        error: error instanceof Error ? error.message : String(error),
      },
    }).catch((err) => logger.error("[sendExportEmail] Audit log failed:", err));
    
    return {
      success: false,
      provider: "microsoft_graph",
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
      provider: "microsoft_graph",
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
