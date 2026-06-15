"use client";

/**
 * DMS 12.1 — DmsDocumentContentSection
 *
 * Read-only view of the consolidated extracted document text stored in
 * dms_document_content. Provides:
 *  - Source badge (OCR / AI Intake / System Resync / Truncated)
 *  - Character count and last-updated timestamp
 *  - Truncated warning banner
 *  - Scrollable text area (read-only)
 *  - Resync button (requires edit/admin permission)
 *
 * Security rules:
 *  - HR / legal / executive documents require admin — handled server-side;
 *    non-admin users see a friendly restricted message.
 *  - content_text is NEVER loaded in list views.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, RefreshCw, AlertTriangle, Lock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDocumentContentText,
  resyncDocumentContentText,
  type DocumentContentRow,
} from "@/server/actions/dms/document-content";
import { format, parseISO } from "date-fns";

// ── Source badge label ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  ocr: "OCR",
  ai_intake: "AI Intake",
  manual_override: "Manual",
  truncated: "Truncated",
  system_resync: "System Resync",
};

const SOURCE_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ocr: "default",
  ai_intake: "secondary",
  manual_override: "outline",
  truncated: "destructive",
  system_resync: "outline",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface DmsDocumentContentSectionProps {
  documentId: number;
  canResync?: boolean;
}

export function DmsDocumentContentSection({
  documentId,
  canResync = false,
}: DmsDocumentContentSectionProps) {
  const queryClient = useQueryClient();
  const [resyncing, setResyncing] = useState(false);

  const { data: contentRow, isLoading, error: queryError } = useQuery<DocumentContentRow | null>({
    queryKey: queryKeys.dms.documentContent(documentId),
    queryFn: async () => {
      const r = await getDocumentContentText(documentId);
      if (!r.success) {
        if (r.error?.includes("Access denied")) {
          return null; // handled as restricted below
        }
        throw new Error(r.error ?? "Failed to load extracted text");
      }
      return r.data ?? null;
    },
    staleTime: 30_000,
    retry: false,
  });

  // ── Resync handler ───────────────────────────────────────────────────────────

  async function handleResync() {
    setResyncing(true);
    try {
      const result = await resyncDocumentContentText(documentId);
      if (!result.success) {
        toast.error(result.error ?? "Resync failed");
      } else {
        toast.success(
          `Content text resynced — ${result.data?.charCount.toLocaleString() ?? 0} characters${result.data?.isTruncated ? " (truncated)" : ""}`
        );
        await queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentContent(documentId) });
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setResyncing(false);
    }
  }

  // ── Resolved row (undefined = not loaded / null = access denied) ─────────────

  const row: DocumentContentRow | null | undefined = contentRow;

  // ── States ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading extracted text…
      </div>
    );
  }

  // Error or access denied (query returned null due to server-side permission check)
  if (queryError || row === null) {
    const isAccessDenied = (queryError instanceof Error && queryError.message.includes("Access denied")) || row === null;
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {isAccessDenied ? "Content Restricted" : "Could not load content"}
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            {isAccessDenied
              ? "Full extracted text for this document is restricted to administrators due to its confidentiality level."
              : (queryError instanceof Error ? queryError.message : "An error occurred.")}
          </p>
        </div>
      </div>
    );
  }

  // No content yet (row is undefined or has no text)
  if (!row || !row.contentText) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No extracted text yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Text is extracted automatically after AI intake approval or OCR completion.
            {canResync && " You can also trigger a manual resync below."}
          </p>
        </div>
        {canResync && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleResync}
            disabled={resyncing}
          >
            {resyncing ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Resync Extracted Text
          </Button>
        )}
      </div>
    );
  }

  // ── Main view (row has content) ───────────────────────────────────────────────

  const sourceBadge = row.source ? (SOURCE_LABELS[row.source] ?? row.source) : "Unknown";
  const badgeVariant = row.source ? (SOURCE_VARIANTS[row.source] ?? "outline") : "outline";

  return (
    <div className="space-y-4 p-1">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Extracted Document Text</span>
        </div>
        <Badge variant={badgeVariant}>{sourceBadge}</Badge>
        {row.charCount !== null && (
          <span className="text-xs text-muted-foreground">
            {row.charCount.toLocaleString()} characters
          </span>
        )}
        {row.updatedAt && (
          <span className="text-xs text-muted-foreground">
            Updated {format(parseISO(row.updatedAt), "d MMM yyyy HH:mm")}
          </span>
        )}
        {canResync && (
          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleResync}
              disabled={resyncing}
            >
              {resyncing ? (
                <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Resync
            </Button>
          </div>
        )}
      </div>

      {/* Truncation warning */}
      {row.isTruncated && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Text was truncated at 100,000 characters. The full OCR text remains in the per-file
            OCR tab.
          </span>
        </div>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This is the consolidated extracted text used for full-text search. It is read-only.
          Raw per-file OCR output is available in the <strong>OCR / Text</strong> tab.
        </span>
      </div>

      {/* Text content */}
      <Textarea
        value={row.contentText ?? ""}
        readOnly
        className="min-h-[320px] font-mono text-xs leading-relaxed"
        aria-label="Extracted document text"
      />
    </div>
  );
}
