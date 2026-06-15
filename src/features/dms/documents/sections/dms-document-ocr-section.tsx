"use client";

/**
 * DMS.9 — DmsDocumentOcrSection
 *
 * Shows OCR status for the document, allows triggering OCR for the current
 * file, viewing extracted text, and retrying failed jobs.
 * No AI classification or field extraction — text only.
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanText, RefreshCw, Copy, Check, RotateCcw, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDmsOcr, invalidateDmsDocumentFiles } from "@/lib/query/invalidation";
import {
  getDmsOcrStatus,
  getDmsFileOcrText,
  triggerDmsOcrForDocument,
  retryDmsOcrJob,
  type DmsOcrFileStatus,
} from "@/server/actions/dms/ocr";
import { getDmsOcrJobs } from "@/server/actions/dms/ocr";
import { DmsOcrStatusBadge } from "@/features/dms/ocr/dms-ocr-status-badge";
import { format, parseISO } from "date-fns";

interface DmsDocumentOcrSectionProps {
  documentId: number;
  canTrigger?: boolean;
  canViewText?: boolean;
}

export function DmsDocumentOcrSection({
  documentId,
  canTrigger = false,
  canViewText = true,
}: DmsDocumentOcrSectionProps) {
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [viewingText, setViewingText] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // OCR status query
  const { data: ocrStatus, isLoading: statusLoading } = useQuery({
    queryKey: queryKeys.dms.documentOcrStatus(documentId),
    queryFn: async () => {
      const r = await getDmsOcrStatus(documentId);
      if (!r.success) throw new Error(r.error);
      return r.data!;
    },
    staleTime: 15_000,
  });

  // OCR jobs query (last 10)
  const { data: ocrJobs = [] } = useQuery({
    queryKey: queryKeys.dms.ocrJobs({ documentId, limit: 10 }),
    queryFn: async () => {
      const r = await getDmsOcrJobs({ documentId, limit: 10, offset: 0 });
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
    staleTime: 15_000,
  });

  // OCR text query (lazy — only when user clicks "View Text")
  const { data: ocrTextData, isLoading: textLoading, refetch: refetchText } = useQuery({
    queryKey: queryKeys.dms.fileOcrText(selectedFileId ?? 0),
    queryFn: async () => {
      if (!selectedFileId) return null;
      const r = await getDmsFileOcrText(selectedFileId);
      if (!r.success) throw new Error(r.error);
      return r.data ?? null;
    },
    enabled: !!selectedFileId && viewingText,
    staleTime: 60_000,
  });

  const handleTriggerAll = async () => {
    setTriggering(true);
    try {
      const result = await triggerDmsOcrForDocument(documentId, { forceRetry: false });
      if (result.success) {
        const triggered = result.data?.triggered ?? 0;
        toast.success(`OCR triggered for ${triggered} file${triggered !== 1 ? "s" : ""}`);
      } else {
        toast.error(result.error ?? "Failed to trigger OCR");
      }
      invalidateDmsOcr(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
    } finally {
      setTriggering(false);
    }
  };

  const handleViewText = useCallback((fileId: number) => {
    setSelectedFileId(fileId);
    setViewingText(true);
    setCopiedText(false);
  }, []);

  const handleCopyText = () => {
    const text = ocrTextData?.ocr_text ?? "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  };

  const handleRetry = async (jobId: number) => {
    const r = await retryDmsOcrJob(jobId);
    if (r.success) {
      toast.success(r.data?.message ?? "OCR retry triggered");
    } else {
      toast.error(r.error ?? "Retry failed");
    }
    invalidateDmsOcr(queryClient, documentId);
    invalidateDmsDocumentFiles(queryClient, documentId);
  };

  if (statusLoading) {
    return (
      <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
        Loading OCR status…
      </div>
    );
  }

  const files = ocrStatus?.files ?? [];
  const hasAnyComplete = files.some((f) => f.ocr_status === "complete");
  const hasAnyFailed = files.some((f) => f.ocr_status === "failed");
  const supportedFiles = files.filter((f) =>
    ["not_started", "failed", "complete"].includes(f.ocr_status)
  );

  return (
    <div className="space-y-5">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Document OCR Status</p>
            <div className="flex items-center gap-2 mt-0.5">
              <DmsOcrStatusBadge status={ocrStatus?.ocr_status} />
              {ocrStatus?.ocr_last_run_at && (
                <span className="text-[11px] text-muted-foreground">
                  Last run: {format(parseISO(ocrStatus.ocr_last_run_at), "dd MMM yyyy HH:mm")}
                </span>
              )}
              {ocrStatus?.ocr_text_available && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Text available
                </span>
              )}
            </div>
          </div>
        </div>

        {canTrigger && supportedFiles.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={triggering}
            onClick={handleTriggerAll}
            className="gap-2"
          >
            {triggering
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
              : <ScanText className="h-3.5 w-3.5" />}
            {triggering ? "Running OCR…" : "Run OCR on All Files"}
          </Button>
        )}
      </div>

      {/* ── Files table ── */}
      {files.length === 0 ? (
        <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Info className="h-5 w-5 opacity-40" />
          <p>No files attached to this document. Upload a file to enable OCR.</p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">File</th>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">OCR Status</th>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Provider</th>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Completed</th>
                <th className="px-3 py-2 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {files.map((file: DmsOcrFileStatus) => (
                <OcrFileRow
                  key={file.file_id}
                  file={file}
                  canTrigger={canTrigger}
                  canViewText={canViewText}
                  documentId={documentId}
                  onViewText={() => handleViewText(file.file_id)}
                  queryClient={queryClient}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── OCR Text Viewer ── */}
      {viewingText && selectedFileId && canViewText && (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
            <div className="flex items-center gap-2">
              <ScanText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Extracted OCR Text</span>
              {ocrTextData?.ocr_text && (
                <span className="text-xs text-muted-foreground">
                  ({ocrTextData.ocr_text.length.toLocaleString()} characters)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {ocrTextData?.ocr_text && (
                <Button size="sm" variant="ghost" className="gap-1.5 h-7" onClick={handleCopyText}>
                  {copiedText ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedText ? "Copied" : "Copy"}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => { setViewingText(false); setSelectedFileId(null); }}>
                Close
              </Button>
            </div>
          </div>

          {textLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading text…</div>
          ) : ocrTextData?.ocr_text ? (
            <Textarea
              readOnly
              value={ocrTextData.ocr_text}
              className="font-mono text-xs resize-none min-h-[300px] rounded-none border-0 focus-visible:ring-0 bg-background"
              rows={20}
            />
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="h-5 w-5 opacity-40" />
              <p>
                {ocrTextData?.ocr_status === "not_started"
                  ? "OCR has not been run yet."
                  : ocrTextData?.ocr_status === "processing"
                  ? "OCR is currently processing…"
                  : "No text was extracted from this file. The file may be a scanned image or empty PDF."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Recent OCR Jobs ── */}
      {ocrJobs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent OCR Jobs</p>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Job ID</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Provider</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Started</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Error</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {ocrJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">#{job.id}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{job.provider ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <DmsOcrStatusBadge status={job.status === "completed" ? "complete" : job.status} />
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {job.started_at ? format(parseISO(job.started_at), "dd MMM HH:mm") : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-destructive max-w-[200px] truncate">
                      {job.error_message ? (
                        <span title={job.error_message}>{job.error_message.slice(0, 60)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {canTrigger && job.status === "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={() => handleRetry(job.id)}
                          title="Retry this OCR job"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Info note ── */}
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          OCR extracts text from digital PDFs (text layer). Scanned images and image-only PDFs may return no text.
          Once OCR is complete, use the <strong>AI Analysis</strong> tab to classify this document and suggest metadata field values.
          OCR text is only sent to AI when you explicitly trigger AI analysis.
        </p>
      </div>
    </div>
  );
}

// ── Sub-component: per-file OCR row ──────────────────────────────────────────

interface OcrFileRowProps {
  file: DmsOcrFileStatus;
  canTrigger: boolean;
  canViewText: boolean;
  documentId: number;
  onViewText: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any;
}

function OcrFileRow({ file, canTrigger, canViewText, documentId, onViewText, queryClient }: OcrFileRowProps) {
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      const { triggerDmsOcrForFile } = await import("@/server/actions/dms/ocr");
      const result = await triggerDmsOcrForFile({ fileId: file.file_id, forceRetry: file.ocr_status === "complete" });
      if (result.success) {
        toast.success(result.data?.message ?? "OCR completed");
      } else {
        toast.error(result.error ?? "OCR failed");
      }
      invalidateDmsOcr(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
    } finally {
      setRunning(false);
    }
  };

  const isRunnable = !["processing", "not_supported"].includes(file.ocr_status ?? "");

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2">
        <p className="text-xs font-medium truncate max-w-[180px]">{file.file_name}</p>
        {file.ocr_error_message && file.ocr_status === "failed" && (
          <p className="text-[10px] text-destructive mt-0.5 truncate max-w-[180px]" title={file.ocr_error_message}>
            {file.ocr_error_message.slice(0, 60)}
          </p>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="text-xs text-muted-foreground">{file.mime_type.split("/")[1] ?? file.mime_type}</span>
      </td>
      <td className="px-3 py-2">
        <DmsOcrStatusBadge status={file.ocr_status} />
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {file.ocr_provider ?? "—"}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {file.ocr_completed_at ? format(parseISO(file.ocr_completed_at), "dd MMM HH:mm") : "—"}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          {canViewText && file.ocr_status === "complete" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onViewText}>
              <ScanText className="h-3 w-3" />
              View Text
            </Button>
          )}
          {canTrigger && isRunnable && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              disabled={running}
              onClick={handleRun}
            >
              {running
                ? <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                : <RefreshCw className="h-3 w-3" />}
              {file.ocr_status === "complete" ? "Re-run" : "Run OCR"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
