"use client";
import {readDmsSection} from "@/features/dms/documents/section-read";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { useGuardedTransition } from "@/hooks/use-guarded-transition";
import { QueryReadBoundary } from "@/features/dms/documents/section-read-boundary";

/**
 * DMS.9 — DmsDocumentOcrSection
 *
 * Shows OCR status for the document, allows triggering OCR for the current
 * file, viewing extracted text, and retrying failed jobs.
 * No AI classification or field extraction — text only.
 */

import { Button } from "@/components/ui/button";
import { DmsBilingualText } from "./dms-bilingual-text";
import { RecentOcrJobsList } from "./recent-ocr-jobs-list";
import { describeOcrStatusReadError, OcrStatusReadError } from "@/lib/dms/ocr/status-read-error";
import { DmsOcrStatusBadge } from "@/features/dms/ocr/dms-ocr-status-badge";
import { invalidateDmsDocumentFiles, invalidateDmsOcr } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import { retryDmsOcrJob, triggerDmsOcrForDocument, type DmsOcrFileStatus } from "@/server/actions/dms/ocr";
import { useQueryClient } from "@tanstack/react-query";
import {useDmsSectionQuery as useQuery} from "@/features/dms/documents/section-activity";
import { format, parseISO } from "date-fns";
import { AlertCircle, Check, Copy, Info, RefreshCw, ScanText } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

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
  const [triggering, triggerAction] = useGuardedTransition();
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [viewingText, setViewingText] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // OCR status query
  const uiRead1 = useQuery({
    queryKey: queryKeys.dms.documentOcrStatus(documentId),
    queryFn: async ({signal}) => {
      const r = await readDmsSection("getDmsOcrStatus", [documentId], signal);
      if (!r.success) throw new OcrStatusReadError(r.errorCode, r.reference);
      return r.data!;
    },
    staleTime: 15_000,
  });
 const { data: ocrStatus, isLoading: statusLoading } = uiRead1;

  // OCR jobs query (last 10)
  const uiRead2 = useQuery({
    queryKey: queryKeys.dms.ocrJobs({ documentId, limit: 10 }),
    queryFn: async ({signal}) => {
      const r = await readDmsSection("getDmsOcrJobs", [{ documentId, limit: 10, offset: 0 }], signal);
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
    staleTime: 15_000,
  });
 const { data: ocrJobs = [] } = uiRead2;

  // OCR text query (lazy — only when user clicks "View Text")
  const uiRead3 = useQuery({
    queryKey: queryKeys.dms.fileOcrText(selectedFileId ?? 0),
    queryFn: async ({signal}) => {
      if (!selectedFileId) return null;
      const r = await readDmsSection("getDmsFileOcrText", [selectedFileId], signal);
      if (!r.success) throw new Error(r.error);
      return r.data ?? null;
    },
    enabled: !!selectedFileId && viewingText,
    staleTime: 60_000,
  });
 const { data: ocrTextData, isLoading: textLoading } = uiRead3;

  const handleTriggerAll = () => triggerAction(async () => {
    if (!canTrigger) return;
      const result = await triggerDmsOcrForDocument(documentId, { forceRetry: false });
      if (result.success) {
        const triggered = result.data?.triggered ?? 0;
        toast.success(`OCR triggered for ${triggered} file${triggered !== 1 ? "s" : ""}`);
      } else {
        toast.error(result.error ?? "Failed to trigger OCR");
      }
      invalidateDmsOcr(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
  });

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

  const handleRetry = (jobId: number) => triggerAction(async () => {
    if (!canTrigger) return;
    const r = await retryDmsOcrJob(jobId);
    if (r.success) {
      toast.success(r.data?.message ?? "OCR retry triggered");
    } else {
      toast.error(r.error ?? "Retry failed");
    }
    invalidateDmsOcr(queryClient, documentId);
    invalidateDmsDocumentFiles(queryClient, documentId);
  });

  if (statusLoading) {
    return (
      <QueryReadBoundary queries={[uiRead1,uiRead2,uiRead3]}><div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
        Loading OCR status…
      </div></QueryReadBoundary>
    );
  }

  // An unavailable read is not an empty file list or a Not Started result.
  if (uiRead1.isError || !ocrStatus) {
    return <QueryReadBoundary queries={[uiRead1]}>
      <div role="status" className="rounded-md border border-border p-6 text-sm text-muted-foreground">
        OCR status and attached files could not be loaded. Retry loading before running OCR.
        <p className="mt-2">{describeOcrStatusReadError(uiRead1.error)}</p>
      </div>
    </QueryReadBoundary>;
  }

  const files = ocrStatus?.files ?? [];
  const hasAnyComplete = files.some((f) => f.ocr_status === "complete");
  const supportedFiles = files.filter((f) =>
    !["processing"].includes(f.ocr_status)
  );

  return (
    <QueryReadBoundary queries={[uiRead1,uiRead2,uiRead3]}><div className="space-y-5">
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
            {triggering ? "Running OCR (AI)…" : "Run OCR (AI) on All Files"}
          </Button>
        )}
      </div>

      {/* ── Warning: OCR complete but no text extracted ── */}
      {hasAnyComplete && !ocrStatus?.ocr_text_available && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <strong>OCR completed but no text was extracted.</strong> This usually happens for scanned PDFs or images
            processed by the old engine. Click <strong>Re-run OCR (AI)</strong> on the file below to extract text
            using the configured vision OCR provider.
          </div>
        </div>
      )}

      {/* ── Files table ── */}
      {files.length === 0 ? (
        <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Info className="h-5 w-5 opacity-40" />
          <p>No files attached to this document. Upload a file to enable OCR.</p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <RecordCollection id={`special.ocr-files.${documentId}`} rows={files}
            fields={[{id:"file_name",path:"file_name",label:"File"},{id:"mime_type",path:"mime_type",label:"Type"},{id:"ocr_status",path:"ocr_status",label:"OCR status"},{id:"ocr_provider",path:"ocr_provider",label:"Provider"}]}
            renderRecord={file => <OcrFileRow file={file} canTrigger={canTrigger} canViewText={canViewText}
              documentId={documentId} onViewText={()=>handleViewText(file.file_id)} queryClient={queryClient}/>} />

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

          {uiRead3.isError ? (
            <div role="status" className="p-4 text-sm text-muted-foreground">OCR text could not be loaded. Retry loading; this does not mean the file has no text.</div>
          ) : textLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading text…</div>
          ) : ocrTextData?.ocr_text ? (
            <DmsBilingualText text={ocrTextData.ocr_text} label="Extracted OCR text" />
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
      <RecentOcrJobsList jobs={ocrJobs} canRetry={canTrigger} retrying={triggering}
        onRetry={handleRetry} formatProvider={formatOcrProvider} />

      {/* ── Info note ── */}
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          OCR extracts text from any document — PDFs (text layer or scanned), images (passport, Emirates ID, certificates), DOCX, and XLSX.
          Clean English PDF text layers use fast local extraction. Arabic, suspicious PDF text layers, scanned PDFs and images use the configured OCR provider.
          If a PDF still reads incorrectly, use “Read page images” to ignore its embedded text. This uses AI and may incur processing costs.
          Once OCR is complete, use the <strong>AI Analysis</strong> tab to classify and extract metadata.
        </p>
      </div>
    </div></QueryReadBoundary>
  );
}

// ── OCR provider display label ────────────────────────────────────────────────

const OCR_PROVIDER_LABELS: Record<string, string> = {
  pdf_text: "Local Text Layer",
  azure_doc_intel: "Azure Document Intelligence",
  vision: "GPT Vision",
  ai_intake: "AI Intake",
  ai_analysis: "AI Analysis",
  noop: "Not Configured",
  tesseract: "Tesseract",
};

function formatOcrProvider(provider: string | null): string {
  if (!provider) return "—";
  return OCR_PROVIDER_LABELS[provider] ?? provider;
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
  const [running, runAction] = useGuardedTransition();

  const handleRun = (forceVision = false) => runAction(async () => {
    if (!canTrigger) return;
      const { triggerDmsOcrForFile } = await import("@/server/actions/dms/ocr");
      const result = await triggerDmsOcrForFile({ fileId: file.file_id, forceRetry: forceVision || file.ocr_status === "complete", forceVision });
      if (result.success) {
        toast.success(result.data?.message ?? "OCR completed");
      } else {
        toast.error(result.error ?? "OCR failed");
      }
      invalidateDmsOcr(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
  });

  const isRunnable = file.ocr_status !== "processing";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="px-3 py-2">
        <p className="text-xs font-medium truncate max-w-[180px]">{file.file_name}</p>
        {file.ocr_error_message && file.ocr_status === "failed" && (
          <p className="text-[10px] text-destructive mt-0.5 truncate max-w-[180px]" title={file.ocr_error_message}>
            {file.ocr_error_message.slice(0, 60)}
          </p>
        )}
      </div>
      <div className="px-3 py-2">
        <span className="text-xs text-muted-foreground">{file.mime_type.split("/")[1] ?? file.mime_type}</span>
      </div>
      <div className="px-3 py-2">
        <DmsOcrStatusBadge status={file.ocr_status} />
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {formatOcrProvider(file.ocr_provider)}
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {file.ocr_completed_at ? format(parseISO(file.ocr_completed_at), "dd MMM HH:mm") : "—"}
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-1">
          {canViewText && file.ocr_status === "complete" && file.has_text && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onViewText}>
              <ScanText className="h-3 w-3" />
              View Text
            </Button>
          )}
          {canTrigger && isRunnable && (
            <Button
              size="sm"
              variant={file.ocr_status === "complete" && !file.has_text ? "outline" : "ghost"}
              className={`h-7 text-xs gap-1 ${file.ocr_status === "complete" && !file.has_text ? "border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30" : ""}`}
              disabled={running}
              onClick={() => handleRun()}
            >
              {running
                ? <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                : <RefreshCw className="h-3 w-3" />}
              {file.ocr_status === "complete"
                ? file.has_text ? "Re-run OCR (AI)" : "Re-run OCR (AI) ⚠"
                : "Run OCR (AI)"}
            </Button>
          )}
          {canTrigger && isRunnable && file.mime_type === "application/pdf" && <Button
            size="sm" variant="outline" className="h-7 text-xs" disabled={running}
            title="Ignore the PDF text layer and use the configured vision model. AI processing costs may apply."
            onClick={() => handleRun(true)}>Read page images</Button>}
        </div>
      </div>
    </div>
  );
}
