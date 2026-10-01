"use client";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { Badge } from "@/components/ui/badge";
import { DmsLoadError } from "@/features/dms/dms-load-error";
import { Button } from "@/components/ui/button";
import { DmsOcrStatusBadge } from "@/features/dms/ocr/dms-ocr-status-badge";
import { DmsFileIntegrityBadge } from "@/features/dms/upload/dms-file-integrity-badge";
import { FileSize } from "@/features/dms/upload/dms-file-size";
import { FileTypeIcon, getMimeTypeLabel } from "@/features/dms/upload/dms-file-type-icon";
import { invalidateDmsDocumentFiles, invalidateDmsOcr } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import {
  adminDeleteDmsDocumentFile,
  getDmsDocumentFiles,
  getDmsDocumentFileSignedUrl,
  type DmsDocumentFileRow,
} from "@/server/actions/dms/document-files";
import { triggerDmsOcrForFile } from "@/server/actions/dms/ocr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  FileX,
  Loader2,
  ScanText,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

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
  canDownload: boolean;
}

function PreviewPanel({ file, onClose, onDownload, canDownload }: PreviewPanelProps) {
  const [imageScale, setImageScale] = useState(1);
  const { data: signedUrl, isPending: loading, error: queryError } = useQuery({
    queryKey: ["dms-file-preview", file.id],
    queryFn: async () => {
      const result = await getDmsDocumentFileSignedUrl(file.id, "preview");
      if (!result.success || !result.data?.signedUrl) throw new Error(result.error ?? "Failed to load preview.");
      return result.data.signedUrl;
    },
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
  const error = queryError?.message;

  const mime = file.mime_type.toLowerCase().split(";")[0].trim();

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background flex flex-col">
      {/* ── Preview header ── */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-muted/30 border-b border-border gap-2 shrink-0">
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
              <Button aria-label="Zoom in"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setImageScale((s) => Math.min(3, parseFloat((s + 0.25).toFixed(2))))}
                title="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button aria-label="Zoom out"
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
          <Button aria-label="Open in new tab"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() =>
                window.open(
                  `/api/dms/file?fileId=${file.id}&disposition=inline`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          {canDownload && <Button aria-label="Download" size="icon" variant="ghost" className="h-7 w-7" onClick={onDownload} title="Download">
            <Download className="h-3.5 w-3.5" />
          </Button>}
          <Button aria-label="Close preview" size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close preview">
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
              <p role="alert" className="text-xs">Preview could not be loaded. Check your connection and access, then reopen the preview.</p>
              {canDownload && <Button size="sm" variant="outline" className="text-xs h-7 mt-1" onClick={onDownload}>
                <Download className="h-3 w-3 mr-1" /> Download to view
              </Button>}
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
              {canDownload && <Button size="sm" variant="outline" className="text-xs h-7" onClick={onDownload}>
                <Download className="h-3 w-3 mr-1" /> Download to view
              </Button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

const DMS_LIST_FIELDS: DmsListField[] = [
  {
    "id": "indicator",
    "label": "Preview indicator",
    "type": "text",
    "width": 160
  },
  {
    "id": "file_name",
    "label": "File",
    "path": "file_name",
    "type": "text",
    "width": 250,
    "required": true
  },
  {
    "id": "mime_type",
    "label": "Type",
    "path": "mime_type",
    "type": "text",
    "width": 160
  },
  {
    "id": "file_size_bytes",
    "label": "Size (bytes)",
    "path": "file_size_bytes",
    "type": "number",
    "width": 160
  },
  {
    "id": "file_role",
    "label": "Role",
    "path": "file_role",
    "type": "text",
    "width": 160
  },
  {
    "id": "integrity_status",
    "label": "Integrity",
    "path": "integrity_status",
    "type": "text",
    "width": 160
  },
  {
    "id": "ocr_status",
    "label": "OCR",
    "path": "ocr_status",
    "type": "text",
    "width": 160
  },
  {
    "id": "version",
    "label": "Version",
    "path": "version.version_number",
    "type": "number",
    "width": 160
  },
  {
    "id": "created_at",
    "label": "Uploaded",
    "path": "created_at",
    "type": "date",
    "width": 160
  },
  {
    "id": "actions",
    "label": "Actions",
    "type": "text",
    "width": 160
  }
];

export function DmsDocumentFilesSection({
  documentId,
  canPreview = false,
  canDownload = false,
  canTriggerOcr = false,
  canDeleteFiles = false,
}: DmsDocumentFilesSectionProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Undefined selects an initial preview. Null explicitly closes it.
  const [selectedFileId, setSelectedFileId] = useState<number | null | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: files = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: queryKeys.dms.documentFiles(documentId),
    queryFn: async () => {
      const result = await getDmsDocumentFiles(documentId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const listView = useDmsListView("document-files", files, DMS_LIST_FIELDS);
  const selectedFile = selectedFileId === undefined
    ? files.find((f) => isPreviewable(f.mime_type)) ?? files[0] ?? null
    : files.find((f) => f.id === selectedFileId) ?? null;

  const handleDownload = useCallback(async (file: DmsDocumentFileRow) => {
    if (!canDownload) return;
    const key = `${file.id}-download`;
    setLoadingAction(key);
    try {
      // Use the server proxy route so Content-Type and Content-Disposition are
      // always correct regardless of how the object was stored in Supabase.
      // This is a same-origin URL so the <a download> attribute is honoured by
      // the browser (cross-origin Supabase signed URLs ignore the attribute).
      const a = document.createElement("a");
      a.href = `/api/dms/file?fileId=${file.id}&disposition=attachment`;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setLoadingAction(null);
    }
  }, [canDownload]);

  const handleRunOcr = async (file: DmsDocumentFileRow) => {
    const key = `${file.id}-ocr`;
    setActionError(null);
    setLoadingAction(key);
    try {
      const result = await triggerDmsOcrForFile({ fileId: file.id, forceRetry: false });
      if (result.success) {
        toast.success(result.data?.message ?? "OCR triggered successfully");
      } else {
        setActionError("OCR was not started. Check the file status and your access before retrying.");
      }
      invalidateDmsOcr(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
    } catch {
      setActionError("The OCR result could not be confirmed. Check the file status before retrying.");
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
    setActionError(null);
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
        void queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentVersions(documentId) });
      } else {
        setActionError("The file was not deleted. Check your access and refresh the file list before retrying.");
      }
    } catch {
      setActionError("The deletion result could not be confirmed. Refresh the file list before retrying.");
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

  if (isError) return <DmsLoadError subject="document files" retry={refetch} pending={isFetching} />;

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
      {actionError && <p role="alert" className="rounded-sm border border-destructive/40 p-3 text-sm">{actionError}</p>}
      {/* ── File list table ── */}
      <><DmsListTools view={listView} search /><div className="rounded-md border border-border overflow-hidden">
        <div role="region" aria-label="document-files table" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth: listView.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listView.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
          <thead>
            <ConfiguredRow columns={listView.columns} className="border-b border-border bg-muted/20">
              <th data-column="indicator" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide w-6" />
              <th data-column="file_name" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">File</th>
              <th data-column="mime_type" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Type</th>
              <th data-column="file_size_bytes" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Size</th>
              <th data-column="file_role" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Role</th>
              <th data-column="integrity_status" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Integrity</th>
              <th data-column="ocr_status" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">OCR</th>
              <th data-column="version" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Version</th>
              <th data-column="created_at" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Uploaded</th>
              <th data-column="actions" className="px-3 py-2 w-28" />
            </ConfiguredRow>
          </thead>
          <tbody className="divide-y divide-border/50">{listView.rows.length === 0 && <tr><td colSpan={listView.visible.length} className="p-4 text-center text-sm text-muted-foreground">No loaded records match your filters.</td></tr>}
            {listView.rows.map((f) => {
              const canPrev = isPreviewable(f.mime_type);
              const isSelected = selectedFile?.id === f.id;
              const downloadKey = `${f.id}-download`;
              const deleteKey = `${f.id}-delete`;
              const isConfirmingDelete = confirmDeleteId === f.id;
              const isDeletingThisFile = loadingAction === deleteKey;

              return (
                <ConfiguredRow columns={listView.columns}
                  key={f.id}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : isConfirmingDelete
                      ? "bg-destructive/5"
                      : "hover:bg-muted/20"
                  }`}
                  onClick={() => { if (canPreview) setSelectedFileId(isSelected ? null : f.id); }}
                >
                  {/* Selection indicator */}
                  <td data-column="indicator" className="px-2 py-2 w-6">
                    {isSelected ? (
                      <ChevronRight className="h-3.5 w-3.5 text-primary" />
                    ) : canPrev ? (
                      <Eye className="h-3 w-3 text-muted-foreground/40" />
                    ) : (
                      <span />
                    )}
                  </td>

                  <td data-column="file_name" className="px-3 py-2">
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

                  <td data-column="mime_type" className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {getMimeTypeLabel(f.mime_type)}
                    </Badge>
                  </td>

                  <td data-column="file_size_bytes" className="px-3 py-2 text-xs text-muted-foreground">
                    <FileSize bytes={f.file_size_bytes} />
                  </td>

                  <td data-column="file_role" className="px-3 py-2">
                    <Badge className="text-[10px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                      {f.file_role}
                    </Badge>
                  </td>

                  <td data-column="integrity_status" className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <DmsFileIntegrityBadge
                      status={f.integrity_status ?? "pending"}
                      checkedAt={f.integrity_checked_at}
                      errorMessage={f.integrity_error_message}
                    />
                  </td>

                  <td data-column="ocr_status" className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <DmsOcrStatusBadge status={f.ocr_status ?? "not_started"} />
                  </td>

                  <td data-column="version" className="px-3 py-2 text-xs text-muted-foreground">
                    {f.version ? `v${f.version.version_number}` : "—"}
                  </td>

                  <td data-column="created_at" className="px-3 py-2 text-xs text-muted-foreground">
                    {format(parseISO(f.created_at), "dd MMM yyyy")}
                  </td>

                  {/* Actions — stop propagation so row click doesn't fire */}
                  <td data-column="actions" className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {canPreview && canPrev && (
                        <Button aria-label={isSelected ? "Hide preview" : "Preview"}
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
                        <Button aria-label="Download"
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
                        <Button aria-label={f.ocr_status === "complete" ? "Re-run OCR" : "Run OCR"}
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
                        <Button aria-label="Delete file (admin)"
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
                          <Button aria-label="Confirm delete"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteFile(f)}
                            title="Confirm delete"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button aria-label="Cancel"
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
                </ConfiguredRow>
              );
            })}
          </tbody>
        </table></div>
      </div></>

      {/* ── Inline preview panel ── */}
      {selectedFile && canPreview && (
        <PreviewPanel
          key={selectedFile.id}
          file={selectedFile}
          canDownload={canDownload}
          onClose={() => setSelectedFileId(null)}
          onDownload={() => handleDownload(selectedFile)}
        />
      )}

      {/* ── Hint when no file selected ── */}
      {!selectedFile && canPreview && files.some((f) => isPreviewable(f.mime_type)) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <FileImage className="h-3.5 w-3.5 shrink-0" />
          <span>Click any file row or the <Eye className="h-3 w-3 inline mx-0.5" /> button to preview it inline.</span>
        </div>
      )}
    </div>
  );
}
