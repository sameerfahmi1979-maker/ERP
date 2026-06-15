/**
 * Email Attachment Preview Component
 * Phase 002E.3C - Send Email Dialog UI
 * 
 * Displays attachment metadata with visual indicators
 * Shows loading, error, and success states
 */

"use client";

import * as React from "react";
import { FileText, Table2, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/email/attachment-utils";
import type { EmailAttachment } from "@/lib/email/email-types";
import type { AttachmentFormat } from "./email-types-ui";

export type EmailAttachmentPreviewProps = {
  /** Generated attachment (if ready) */
  attachment?: EmailAttachment | null;
  /** Selected attachment format */
  format: AttachmentFormat;
  /** Loading state (generating attachment) */
  isLoading?: boolean;
  /** Error message (if generation failed) */
  error?: string | null;
  /** Number of records being exported */
  recordCount?: number;
  /** Export mode (selected/filtered/all) */
  exportMode?: "selected" | "filtered" | "all";
};

/**
 * Email attachment preview
 * 
 * Features:
 * - Format badge (PDF/Excel/CSV)
 * - File icon based on format
 * - Filename display
 * - File size with formatBytes
 * - Record count context
 * - Large attachment warning (>8 MB)
 * - Loading state with spinner
 * - Error state with message
 * 
 * @example
 * ```tsx
 * <EmailAttachmentPreview
 *   attachment={attachment}
 *   format="pdf"
 *   isLoading={isGenerating}
 *   error={attachmentError}
 *   recordCount={50}
 *   exportMode="selected"
 * />
 * ```
 */
export function EmailAttachmentPreview({
  attachment,
  format,
  isLoading = false,
  error = null,
  recordCount,
  exportMode,
}: EmailAttachmentPreviewProps) {
  // Format label
  const formatLabel = React.useMemo(() => {
    switch (format) {
      case "pdf":
        return "PDF";
      case "excel":
        return "Excel";
      case "csv":
        return "CSV";
    }
  }, [format]);

  // Format icon
  const FormatIcon = React.useMemo(() => {
    switch (format) {
      case "pdf":
        return FileText;
      case "excel":
        return FileSpreadsheet;
      case "csv":
        return Table2;
    }
  }, [format]);

  // Format badge variant
  const formatBadgeVariant = React.useMemo(() => {
    switch (format) {
      case "pdf":
        return "destructive" as const; // Red for PDF
      case "excel":
        return "default" as const; // Green for Excel
      case "csv":
        return "secondary" as const; // Gray for CSV
    }
  }, [format]);

  // Record count text
  const recordCountText = React.useMemo(() => {
    if (recordCount === undefined) return null;
    
    const modeText = exportMode ? ` ${exportMode}` : "";
    if (recordCount === 0) return "No records";
    if (recordCount === 1) return `1${modeText} record`;
    return `${recordCount}${modeText} records`;
  }, [recordCount, exportMode]);

  // Large attachment warning (>8 MB)
  const isLargeAttachment = attachment && attachment.sizeBytes > 8 * 1024 * 1024;

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border border-input bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              Generating {formatLabel} attachment...
            </p>
            {recordCountText && (
              <p className="text-xs text-muted-foreground mt-0.5">{recordCountText}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/20">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Failed to generate attachment</p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No attachment yet (shouldn't happen if loading/error handled)
  if (!attachment) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-muted/10 p-4">
        <p className="text-sm text-muted-foreground text-center">No attachment generated</p>
      </div>
    );
  }

  // Success state
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 p-4",
        isLargeAttachment ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20" : "border-input"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Format icon */}
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
          <FormatIcon className="h-5 w-5 text-foreground" />
        </div>

        {/* Attachment metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-medium truncate flex-1">{attachment.filename}</p>
            <Badge variant={formatBadgeVariant} className="shrink-0">
              {formatLabel}
            </Badge>
          </div>

          {/* Size and record count */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {recordCountText && (
              <>
                <span>{recordCountText}</span>
                <span className="text-muted-foreground/50">•</span>
              </>
            )}
            <span>{formatBytes(attachment.sizeBytes)}</span>
          </div>

          {/* Large attachment warning */}
          {isLargeAttachment && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Large attachment (may take longer to send)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
