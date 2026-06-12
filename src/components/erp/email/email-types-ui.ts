/**
 * Email UI Type Definitions
 * Phase 002E.3C - Send Email Dialog UI
 * 
 * UI-specific types for email composition dialog
 * (Separate from src/lib/email/email-types.ts to avoid circular imports)
 */

import type { EmailAttachment } from "@/lib/email/email-types";

/**
 * Attachment format selector
 * (Subset of ERPExportFormat, excluding "print")
 */
export type AttachmentFormat = "pdf" | "excel" | "csv";

/**
 * Attachment option for dialog
 * 
 * Encapsulates attachment generation logic for each format
 */
export type AttachmentOption = {
  /** Attachment format type */
  type: AttachmentFormat;
  /** Display label for format selector */
  label: string;
  /** Base filename (without timestamp/extension) */
  filename: string;
  /** Function to generate attachment (can be sync or async) */
  generateAttachment: () => Promise<EmailAttachment> | EmailAttachment;
};

/**
 * Prepared email input (before conversion to SendEmailInput)
 * 
 * Raw form data from dialog UI
 * Phase 002E.3D will convert this to SendEmailInput for server action
 */
export type PreparedEmailInput = {
  /** Raw To field value (comma-separated emails) */
  to: string;
  /** Raw CC field value (comma-separated emails) */
  cc: string;
  /** Raw BCC field value (comma-separated emails) */
  bcc: string;
  /** Email subject */
  subject: string;
  /** Email body (plain text for Phase 002E.3C, HTML in Phase 002E.4+) */
  body: string;
  /** Selected attachment format */
  attachmentType: AttachmentFormat;
  /** Generated attachment (if successful) */
  attachment?: EmailAttachment | null;
};

/**
 * Props for ERPSendEmailDialog component
 * 
 * Main email composition dialog
 */
export type ERPSendEmailDialogProps = {
  /** Dialog open state */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Report/module title (e.g., "Organizations Report") */
  title: string;
  /** Report subtitle/description (e.g., "Master Data Export") */
  subtitle?: string;
  /** Default email subject (e.g., "Organizations Report - 2026-05-28") */
  defaultSubject?: string;
  /** Default email body */
  defaultBody?: string;
  /** Available attachment format options */
  attachmentOptions: AttachmentOption[];
  /** Default attachment format (default: "pdf") */
  defaultAttachmentType?: AttachmentFormat;
  /** Who generated this export (for audit trail) */
  generatedBy?: string;
  /** Number of records being exported */
  recordCount?: number;
  /** Export mode (selected/filtered/all) */
  exportMode?: "selected" | "filtered" | "all";
  /** Module/feature code (for future audit logging) */
  moduleCode?: string;
  /**
   * Callback when user clicks "Send Email"
   * 
   * Phase 002E.3D: Now supports async server action
   * Returns success/error result
   * 
   * Example:
   * ```typescript
   * const handleSend = async (input: PreparedEmailInput) => {
   *   const result = await sendExportEmail({...});
   *   if (result.success) toast.success("Email sent!");
   *   else toast.error(result.error);
   *   return result;
   * };
   * ```
   */
  onPreparedSend?: (input: PreparedEmailInput) => Promise<{ success: boolean; error?: string }>;
};
