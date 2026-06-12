/**
 * ERP Send Email Dialog Component
 * Phase 002E.3C - Send Email Dialog UI
 * 
 * Enterprise email composition dialog with attachment generation
 * Includes client-side validation and preparation for server action (Phase 002E.3D)
 */

"use client";

import * as React from "react";
import { format } from "date-fns";
import { Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { validateEmail, parseEmailList } from "@/lib/email/email-validation";
import { formatBytes } from "@/lib/email/attachment-utils";
import { EmailRecipientInput } from "./email-recipient-input";
import { EmailAttachmentPreview } from "./email-attachment-preview";
import type {
  ERPSendEmailDialogProps,
  AttachmentFormat,
  PreparedEmailInput,
} from "./email-types-ui";
import type { EmailAttachment } from "@/lib/email/email-types";

// Constants (lightweight UI validation, full validation in Phase 002E.3D server action)
const MAX_RECIPIENTS = 20;
const MAX_ATTACHMENT_MB = 10;
const MAX_SUBJECT_LENGTH = 255;
const MAX_BODY_LENGTH = 10_000;

// Default email body template
const DEFAULT_EMAIL_BODY = `Dear Sir/Madam,

Please find attached the requested report.

Regards,
ERP System`;

/**
 * ERP Send Email Dialog
 * 
 * Features:
 * - To/CC/BCC recipient fields with validation
 * - Subject and body fields
 * - Attachment format selector (PDF/Excel/CSV)
 * - Attachment preview with size/record count
 * - Client-side validation
 * - Prepare Send button (no-op for Phase 002E.3C, will call server action in Phase 002E.3D)
 * 
 * @example
 * ```tsx
 * <ERPSendEmailDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Organizations Report"
 *   subtitle="Master Data Export"
 *   defaultSubject="Organizations Report - 2026-05-28"
 *   attachmentOptions={[
 *     {
 *       type: "pdf",
 *       label: "PDF",
 *       filename: "organizations",
 *       generateAttachment: () => generatePDFAttachment(options),
 *     },
 *     // ... excel, csv
 *   ]}
 *   recordCount={50}
 *   exportMode="selected"
 *   onPreparedSend={(input) => console.log("Prepared:", input)}
 * />
 * ```
 */
export function ERPSendEmailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  defaultSubject,
  defaultBody,
  attachmentOptions,
  defaultAttachmentType = "pdf",
  generatedBy,
  recordCount,
  exportMode,
  moduleCode,
  onPreparedSend,
}: ERPSendEmailDialogProps) {
  // Form state
  const [to, setTo] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [subject, setSubject] = React.useState(
    defaultSubject || `${title} - ${format(new Date(), "yyyy-MM-dd")}`
  );
  const [body, setBody] = React.useState(defaultBody || DEFAULT_EMAIL_BODY);
  const [attachmentType, setAttachmentType] = React.useState<AttachmentFormat>(
    defaultAttachmentType
  );

  // Attachment state
  const [attachment, setAttachment] = React.useState<EmailAttachment | null>(null);
  const [isGeneratingAttachment, setIsGeneratingAttachment] = React.useState(false);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);

  // Validation state
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = React.useState(false);
  
  // Sending state (Phase 002E.3D)
  const [isSending, setIsSending] = React.useState(false);

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      // Reset form
      setTo("");
      setCc("");
      setBcc("");
      setSubject(defaultSubject || `${title} - ${format(new Date(), "yyyy-MM-dd")}`);
      setBody(defaultBody || DEFAULT_EMAIL_BODY);
      setAttachmentType(defaultAttachmentType);
      setValidationErrors({});
      setHasAttemptedSubmit(false);
      setAttachment(null);
      setIsGeneratingAttachment(false);
      setAttachmentError(null);
    } else {
      // Clear all state when closed (free memory)
      setAttachment(null);
    }
  }, [open, title, defaultSubject, defaultBody, defaultAttachmentType]);

  // Generate attachment when format changes or dialog opens
  React.useEffect(() => {
    if (!open) return;

    async function generateAttachment() {
      setIsGeneratingAttachment(true);
      setAttachmentError(null);
      setAttachment(null);

      try {
        const option = attachmentOptions.find((opt) => opt.type === attachmentType);
        if (!option) {
          throw new Error(`Invalid attachment type: ${attachmentType}`);
        }

        const result = await Promise.resolve(option.generateAttachment());
        setAttachment(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to generate attachment";
        setAttachmentError(errorMessage);
        console.error("[ERPSendEmailDialog] Attachment generation error:", error);
      } finally {
        setIsGeneratingAttachment(false);
      }
    }

    generateAttachment();
  }, [open, attachmentType, attachmentOptions]);

  // Validate form
  const validateForm = React.useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Parse all recipients
    const toEmails = parseEmailList(to);
    const ccEmails = parseEmailList(cc);
    const bccEmails = parseEmailList(bcc);
    const allEmails = [...toEmails, ...ccEmails, ...bccEmails];

    // To required
    if (toEmails.length === 0) {
      errors.to = "At least one recipient is required";
    }

    // Validate all email addresses
    const invalidEmails = allEmails.filter((e) => !validateEmail(e.email));
    if (invalidEmails.length > 0) {
      if (invalidEmails.some((e) => toEmails.includes(e))) {
        errors.to = `Invalid email: ${invalidEmails[0].email}`;
      } else if (invalidEmails.some((e) => ccEmails.includes(e))) {
        errors.cc = `Invalid email: ${invalidEmails[0].email}`;
      } else if (invalidEmails.some((e) => bccEmails.includes(e))) {
        errors.bcc = `Invalid email: ${invalidEmails[0].email}`;
      }
    }

    // Total recipients limit
    if (allEmails.length > MAX_RECIPIENTS) {
      errors.to = `Too many recipients (${allEmails.length}). Maximum: ${MAX_RECIPIENTS}`;
    }

    // Subject required and max length
    if (!subject || subject.trim().length === 0) {
      errors.subject = "Subject is required";
    } else if (subject.length > MAX_SUBJECT_LENGTH) {
      errors.subject = `Subject too long (max ${MAX_SUBJECT_LENGTH} characters)`;
    }

    // Body required and max length
    if (!body || body.trim().length === 0) {
      errors.body = "Message is required";
    } else if (body.length > MAX_BODY_LENGTH) {
      errors.body = `Message too long (max ${MAX_BODY_LENGTH.toLocaleString()} characters)`;
    }

    // Attachment required
    if (!attachment) {
      errors.attachment = isGeneratingAttachment
        ? "Attachment is generating..."
        : "Attachment generation failed";
    }

    // Attachment size check
    if (attachment && attachment.sizeBytes > MAX_ATTACHMENT_MB * 1024 * 1024) {
      const sizeMB = (attachment.sizeBytes / (1024 * 1024)).toFixed(1);
      errors.attachment = `Attachment too large (${sizeMB} MB). Maximum: ${MAX_ATTACHMENT_MB} MB`;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [to, cc, bcc, subject, body, attachment, isGeneratingAttachment]);

  // Validate on changes after first submit attempt
  React.useEffect(() => {
    if (hasAttemptedSubmit) {
      validateForm();
    }
  }, [hasAttemptedSubmit, validateForm]);

  // Handle send email (Phase 002E.3D - now async)
  const handlePreparedSend = React.useCallback(async () => {
    setHasAttemptedSubmit(true);

    if (!validateForm()) {
      console.log("[ERPSendEmailDialog] Validation failed:", validationErrors);
      return;
    }

    if (!attachment) {
      console.error("[ERPSendEmailDialog] No attachment generated");
      return;
    }
    
    if (!onPreparedSend) {
      console.error("[ERPSendEmailDialog] No onPreparedSend callback provided");
      return;
    }

    const preparedInput: PreparedEmailInput = {
      to,
      cc,
      bcc,
      subject,
      body,
      attachmentType,
      attachment,
    };

    // Log prepared email (Phase 002E.3D - now actually sends)
    console.log("[Phase 002E.3D] Sending email:", {
      to: to.trim() ? parseEmailList(to).map((e) => e.email) : [],
      cc: cc.trim() ? parseEmailList(cc).map((e) => e.email) : [],
      bcc: bcc.trim() ? parseEmailList(bcc).map((e) => e.email) : [],
      subject,
      bodyLength: body.length,
      attachmentType,
      attachment: `${attachment.filename} (${formatBytes(attachment.sizeBytes)})`,
      moduleCode,
      generatedBy,
      recordCount,
      exportMode,
    });

    setIsSending(true);
    
    try {
      // Call async callback (server action)
      const result = await onPreparedSend(preparedInput);
      
      if (result.success) {
        // Success - close dialog (parent will show toast)
        console.log("[ERPSendEmailDialog] Email sent successfully");
        onOpenChange(false);
      } else {
        // Error - keep dialog open (parent will show error toast)
        console.error("[ERPSendEmailDialog] Email send failed:", result.error);
        // User can retry after seeing error toast
      }
    } catch (error) {
      console.error("[ERPSendEmailDialog] Unexpected error:", error);
      // Parent will show error toast
    } finally {
      setIsSending(false);
    }
  }, [
    validateForm,
    validationErrors,
    attachment,
    to,
    cc,
    bcc,
    subject,
    body,
    attachmentType,
    moduleCode,
    generatedBy,
    recordCount,
    exportMode,
    onPreparedSend,
    onOpenChange,
  ]);

  // Export mode badge text
  const exportModeText = React.useMemo(() => {
    if (!recordCount) return null;
    const modeLabel = exportMode ? `${exportMode} ` : "";
    return `${recordCount} ${modeLabel}${recordCount === 1 ? "record" : "records"}`;
  }, [recordCount, exportMode]);

  // Character count for body
  const bodyCharCount = `${body.length.toLocaleString()}/${MAX_BODY_LENGTH.toLocaleString()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send by Email</DialogTitle>
          <DialogDescription className="space-y-1">
            <div className="font-medium text-foreground">{title}</div>
            {subtitle && <div className="text-sm">{subtitle}</div>}
            <div className="flex items-center gap-2 text-xs">
              {exportModeText && (
                <>
                  <span>{exportModeText}</span>
                  <span className="text-muted-foreground/50">•</span>
                </>
              )}
              <span>{attachmentType.toUpperCase()} attachment</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recipients */}
          <EmailRecipientInput
            label="To"
            value={to}
            onChange={setTo}
            required
            placeholder="recipient@example.com"
            error={validationErrors.to}
            disabled={isSending}
          />

          <EmailRecipientInput
            label="CC"
            value={cc}
            onChange={setCc}
            placeholder="cc@example.com (optional)"
            error={validationErrors.cc}
            disabled={isSending}
          />

          <EmailRecipientInput
            label="BCC"
            value={bcc}
            onChange={setBcc}
            placeholder="bcc@example.com (optional)"
            error={validationErrors.bcc}
            disabled={isSending}
          />

          {/* Subject */}
          <div className="space-y-1.5">
            <label htmlFor="email-subject" className="text-sm font-medium">
              Subject <span className="text-destructive ml-0.5">*</span>
            </label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              aria-invalid={!!validationErrors.subject}
              disabled={isSending}
              className={cn(validationErrors.subject && "border-destructive")}
            />
            {validationErrors.subject && (
              <p className="text-xs text-destructive">{validationErrors.subject}</p>
            )}
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label htmlFor="email-body" className="text-sm font-medium">
              Message <span className="text-destructive ml-0.5">*</span>
            </label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email message"
              rows={6}
              aria-invalid={!!validationErrors.body}
              disabled={isSending}
              className={cn(
                "min-h-[120px] resize-y",
                validationErrors.body && "border-destructive"
              )}
            />
            <div className="flex items-start justify-between gap-2">
              {validationErrors.body ? (
                <p className="text-xs text-destructive">{validationErrors.body}</p>
              ) : (
                <div />
              )}
              <p className="text-xs text-muted-foreground">{bodyCharCount} characters</p>
            </div>
          </div>

          {/* Attachment Format Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Attachment Format <span className="text-destructive ml-0.5">*</span>
            </label>
            <div className="flex items-center gap-3">
              {attachmentOptions.map((option) => (
                <label
                  key={option.type}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                    attachmentType === option.type
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-muted/50"
                  )}
                >
                  <input
                    type="radio"
                    name="attachment-format"
                    value={option.type}
                    checked={attachmentType === option.type}
                    onChange={(e) => setAttachmentType(e.target.value as AttachmentFormat)}
                    disabled={isSending}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Attachment Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Attachment Preview</label>
            <EmailAttachmentPreview
              attachment={attachment}
              format={attachmentType}
              isLoading={isGeneratingAttachment}
              error={attachmentError}
              recordCount={recordCount}
              exportMode={exportMode}
            />
            {validationErrors.attachment && (
              <p className="text-xs text-destructive">{validationErrors.attachment}</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handlePreparedSend}
            disabled={
              isGeneratingAttachment ||
              isSending ||
              (hasAttemptedSubmit && Object.keys(validationErrors).length > 0)
            }
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
