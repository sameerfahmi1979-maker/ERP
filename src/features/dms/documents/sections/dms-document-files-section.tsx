"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  FileX,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  ScanText,
  Trash2,
  AlertTriangle,
  X,
  Check,
  ChevronRight,
  FileImage,
  FileText,
  ZoomIn,
  ZoomOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDmsOcr, invalidateDmsDocumentFiles } from "@/lib/query/invalidation";
import {
  getDmsDocumentFiles,
  getDmsDocumentFileSignedUrl,
  adminDeleteDmsDocumentFile,
  type DmsDocumentFileRow,
} from "@/server/actions/dms/document-files";
import { triggerDmsOcrForFile } from "@/server/actions/dms/ocr";
import { FileTypeIcon, getMimeTypeLabel } from "@/features/dms/upload/dms-file-type-icon";
import { FileSize } from "@/features/dms/upload/dms-file-size";
import { DmsFileIntegrityBadge } from "@/features/dms/upload/dms-file-integrity-badge";
import { DmsOcrStatusBadge } from "@/features/dms/ocr/dms-ocr-status-badge";

// ── MIME type helpers ──────────────────────────────────────────────────────────

const PDF_TYPES = new Set(["application/pdf"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/tiff", "image/tif"]);

function isPdf(mime: string) { return PDF_TYPES.has(mime.toLowerCase().split(";")[0].trim()); }
function isImage(mime: string) { return IMAGE_TYPES.has(mime.toLowerCase().split(";")[0].trim()); }
function isPreviewable(mime: string) { return isPdf(mime) || isImage(mime); }

// ── Props ────────────────────────────────────────────────────────────────────

interface DmsDocumentFilesSectionProps {
  documentId: number;
  canPreview?: boolean;
  canDownload?: boolean;
  canTriggerOcr?: boolean;
  canDeleteFiles?: boolean;
}

// ── Preview panel ─────────────────────────────────────────────────────────────

interface PreviewPanelProps {
  file: DmsDocumentFileRow;
  onClose: () => void;
  onDownload: () => void;
}

function PreviewPanel({ file, onClose, onDownload }: PreviewPanelProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    setImageScale(1);

    getDmsDocumentFileSignedUrl(file.id, "preview").then((res) => {
      if (cancelled) return;
      if (res.success && res.data?.signedUrl) {
        setSignedUrl(res.data.signedUrl);
      } else {
        setError(res.error ?? "Failed to load preview.");
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [file.id]);

  const mime = file.mime_type.toLowerCase().split(";")[0].trim();

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background flex flex-col">
      {/* ── Preview header ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileTypeIcon mimeType={file.mime_type} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate max-w-[280px]">{file.file_name}</p>
            <p className="text-[10px] text-muted-foreground">
              {getMimeTypeLabel(file.mime_type)} · <FileSize bytes={file.file_size_bytes} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isImage(mime) && signedUrl && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setImageScale((s) => Math.min(3, parseFloat((s + 0.25).toFixed(2))))}
                title="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setImageScale((s) => Math.max(0.25, parseFloat((s - 0.25).toFixed(2))))}
                title="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              {imageScale !== 1 && (
                <span className="text-[10px] text-muted-foreground w-9 text-center">
                  {Math.round(imageScale * 100)}%
                </span>
              )}
            </>
          )}
          {signedUrl && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDownload} title="Download">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close preview">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Preview body ── */}
      <div className="relative bg-muted/10" style={{ minHeight: 420 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Loading preview…</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-4">
              <AlertTriangle className="h-6 w-6 text-destructive/60" />
              <p className="text-xs">{error}</p>
              <Button size="sm" variant="outline" className="text-xs h-7 mt-1" onClick={onDownload}>
                <Download className="h-3 w-3 mr-1" /> Download to view
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && signedUrl && isPdf(mime) && (
          <iframe
            src={signedUrl}
            title={file.file_name}
            className="w-full border-0"
            style={{ height: 560 }}
          />
        )}

        {!loading && !error && signedUrl && isImage(mime) && (
          <div className="overflow-auto p-3 flex items-start justify-center" style={{ minHeight: 420 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt={file.file_name}
              style={{
                transform: `scale(${imageScale})`,
                transformOrigin: "top center",
                maxWidth: "100%",
                height: "auto",
                transition: "transform 0.2s",
              }}
            />
          </div>
        )}

        {!loading && !error && !isPreviewable(mime) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground text-center px-4">
              <div className="p-3 rounded-full bg-muted">
                <FileText className="h-8 w-8 opacity-40" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Preview not available</p>
                <p className="text-xs mt-1 opacity-70">
                  {getMimeTypeLabel(file.mime_type)} files cannot be previewed in the browser.
                </p>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={onDownload}>
                <Download className="h-3 w-3 mr-1" /> Download to view
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function DmsDocumentFilesSection({
  documentId,
  canPreview = true,
  canDownload = true,
  canTriggerOcr = false,
  canDeleteFiles = false,
}: DmsDocumentFilesSectionProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: files = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.documentFiles(documentId),
    queryFn: async () => {
      const result = await getDmsDocumentFiles(documentId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  // Auto-select first previewable file when files load
  useEffect(() => {
    if (files.length > 0 && selectedFileId === null) {
      const first = files.find((f) => isPreviewable(f.mime_type)) ?? files[0];
      setSelectedFileId(first?.id ?? null);
    }
  }, [files, selectedFileId]);

  const selectedFile = files.find((f) => f.id === selectedFileId) ?? null;

  const handleDownload = useCallback(async (file: DmsDocumentFileRow) => {
    const key = `${file.id}-download`;
    setLoadingAction(key);
    try {
      const result = await getDmsDocumentFileSignedUrl(file.id, "download");
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Failed to generate download URL");
        return;
      }
      const a = document.createElement("a");
      a.href = result.data.signedUrl;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setLoadingAction(null);
    }
  }, []);

  const handleRunOcr = async (file: DmsDocumentFileRow) => {
    const key = `${file.id}-ocr`;
    setLoadingAction(key);
    try {
      const result = await triggerDmsOcrForFile({ fileId: file.id, forceRetry: false });
      if (result.success) {
        toast.success(result.data?.message ?? "OCR triggered successfully");
      } else {
        toast.error(result.error ?? "Failed to trigger OCR");
      }
      invalidateDmsOcr(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDeleteFile = async (file: DmsDocumentFileRow) => {
    if (confirmDeleteId !== file.id) {
      setConfirmDeleteId(file.id);
      return;
    }
    const key = `${file.id}-delete`;
    setConfirmDeleteId(null);
    setLoadingAction(key);
    try {
      const result = await adminDeleteDmsDocumentFile(file.id);
      if (result.success && result.data) {
        const r = result.data;
        const parts: string[] = [];
        if (r.storageDeleted) parts.push("removed from storage");
        if (r.storageAlreadyMissing) parts.push("already missing from storage");
        if (r.aiResultsNulled > 0) parts.push(`${r.aiResultsNulled} AI result(s) unlinked`);
        if (r.versionCleaned) parts.push("empty version cleaned up");
        if (r.currentVersionUpdated) parts.push("current version updated");
        toast.success(`File "${file.file_name}" deleted. ${parts.join(", ") || ""}`.trim());
        if (selectedFileId === file.id) setSelectedFileId(null);
        invalidateDmsDocumentFiles(queryClient, documentId);
        invalidateDmsOcr(queryClient, documentId);
        queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentVersions(documentId) });
      } else {
        toast.error(result.error ?? "Failed to delete file");
      }
    } finally {
      setLoadingAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading files…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <FileX className="h-8 w-8 opacity-30" />
        <div className="text-center">
          <p className="text-sm font-medium">No files attached</p>
          <p className="text-xs mt-1 opacity-70">
            Upload a file from the{" "}
            <a href="/dms/inbox" className="text-primary hover:underline inline-flex items-center gap-0.5">
              Upload Inbox <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {" "}and attach it to this document.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── File list table ── */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide w-6" />
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">File</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Type</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Size</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Role</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Integrity</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">OCR</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Version</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Uploaded</th>
              <th className="px-3 py-2 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {files.map((f) => {
              const canPrev = isPreviewable(f.mime_type);
              const isSelected = selectedFileId === f.id;
              const downloadKey = `${f.id}-download`;
              const deleteKey = `${f.id}-delete`;
              const isConfirmingDelete = confirmDeleteId === f.id;
              const isDeletingThisFile = loadingAction === deleteKey;

              return (
                <tr
                  key={f.id}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : isConfirmingDelete
                      ? "bg-destructive/5"
                      : "hover:bg-muted/20"
                  }`}
                  onClick={() => setSelectedFileId(isSelected ? null : f.id)}
                >
                  {/* Selection indicator */}
                  <td className="px-2 py-2 w-6">
                    {isSelected ? (
                      <ChevronRight className="h-3.5 w-3.5 text-primary" />
                    ) : canPrev ? (
                      <Eye className="h-3 w-3 text-muted-foreground/40" />
                    ) : (
                      <span />
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileTypeIcon mimeType={f.mime_type} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[160px]">{f.file_name}</p>
                        {f.sha256_hash && (
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {f.sha256_hash.substring(0, 12)}…
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {getMimeTypeLabel(f.mime_type)}
                    </Badge>
                  </td>

                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <FileSize bytes={f.file_size_bytes} />
                  </td>

                  <td className="px-3 py-2">
                    <Badge className="text-[10px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                      {f.file_role}
                    </Badge>
                  </td>

                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <DmsFileIntegrityBadge
                      status={f.integrity_status ?? "pending"}
                      checkedAt={f.integrity_checked_at}
                      errorMessage={f.integrity_error_message}
                    />
                  </td>

                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <DmsOcrStatusBadge status={f.ocr_status ?? "not_started"} />
                  </td>

                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {f.version ? `v${f.version.version_number}` : "—"}
                  </td>

                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {format(parseISO(f.created_at), "dd MMM yyyy")}
                  </td>

                  {/* Actions — stop propagation so row click doesn't fire */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {canPreview && canPrev && (
                        <Button
                          size="icon"
                          variant={isSelected ? "default" : "ghost"}
                          className="h-7 w-7"
                          onClick={() => setSelectedFileId(isSelected ? null : f.id)}
                          title={isSelected ? "Hide preview" : "Preview"}
                        >
                          {isSelected
                            ? <EyeOff className="h-3.5 w-3.5" />
                            : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      )}

                      {canDownload && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={loadingAction === downloadKey}
                          onClick={() => handleDownload(f)}
                          title="Download"
                        >
                          {loadingAction === downloadKey
                            ? <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                            : <Download className="h-3.5 w-3.5" />}
                        </Button>
                      )}

                      {canTriggerOcr && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={loadingAction === `${f.id}-ocr` || f.ocr_status === "processing"}
                          onClick={() => handleRunOcr(f)}
                          title={f.ocr_status === "complete" ? "Re-run OCR" : "Run OCR"}
                        >
                          {loadingAction === `${f.id}-ocr`
                            ? <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                            : <ScanText className="h-3.5 w-3.5" />}
                        </Button>
                      )}

                      {canDeleteFiles && !isConfirmingDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          disabled={isDeletingThisFile}
                          onClick={() => handleDeleteFile(f)}
                          title="Delete file (admin)"
                        >
                          {isDeletingThisFile
                            ? <div className="h-3 w-3 animate-spin rounded-full border border-destructive border-t-transparent" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}

                      {canDeleteFiles && isConfirmingDelete && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                          <span className="text-[10px] text-destructive font-medium">Sure?</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteFile(f)}
                            title="Confirm delete"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setConfirmDeleteId(null)}
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Inline preview panel ── */}
      {selectedFile && canPreview && (
        <PreviewPanel
          key={selectedFile.id}
          file={selectedFile}
          onClose={() => setSelectedFileId(null)}
          onDownload={() => handleDownload(selectedFile)}
        />
      )}

      {/* ── Hint when no file selected ── */}
      {!selectedFile && files.some((f) => isPreviewable(f.mime_type)) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <FileImage className="h-3.5 w-3.5 shrink-0" />
          <span>Click any file row or the <Eye className="h-3 w-3 inline mx-0.5" /> button to preview it inline.</span>
        </div>
      )}
    </div>
  );
}
