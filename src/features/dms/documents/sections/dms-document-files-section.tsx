"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { FileX, Download, Eye, ExternalLink, ScanText, Trash2, AlertTriangle, X, Check } from "lucide-react";
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

interface DmsDocumentFilesSectionProps {
  documentId: number;
  canPreview?: boolean;
  canDownload?: boolean;
  canTriggerOcr?: boolean;
  canDeleteFiles?: boolean;
}

const PREVIEWABLE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
];

export function DmsDocumentFilesSection({
  documentId,
  canPreview = true,
  canDownload = true,
  canTriggerOcr = false,
  canDeleteFiles = false,
}: DmsDocumentFilesSectionProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
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

  const handleSignedUrl = async (file: DmsDocumentFileRow, action: "preview" | "download") => {
    const key = `${file.id}-${action}`;
    setLoadingAction(key);
    try {
      const result = await getDmsDocumentFileSignedUrl(file.id, action);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Failed to generate URL");
        return;
      }
      if (action === "preview") {
        window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = result.data.signedUrl;
        a.download = file.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      setLoadingAction(null);
    }
  };

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
        Loading files…
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
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">File</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Type</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Size</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Integrity</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">OCR</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Version</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground uppercase tracking-wide">Uploaded</th>
            <th className="px-3 py-2 w-36" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {files.map((f) => {
            const isPreviewable = PREVIEWABLE_TYPES.includes(f.mime_type);
            const previewKey = `${f.id}-preview`;
            const downloadKey = `${f.id}-download`;
            const deleteKey = `${f.id}-delete`;
            const isConfirmingDelete = confirmDeleteId === f.id;
            const isDeletingThisFile = loadingAction === deleteKey;
            return (
              <tr key={f.id} className={`hover:bg-muted/20 transition-colors ${isConfirmingDelete ? "bg-destructive/5" : ""}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileTypeIcon mimeType={f.mime_type} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-[180px]">{f.file_name}</p>
                      {f.sha256_hash && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {f.sha256_hash.substring(0, 12)}…
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
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
                <td className="px-3 py-2">
                  <DmsFileIntegrityBadge
                    status={f.integrity_status ?? "pending"}
                    checkedAt={f.integrity_checked_at}
                    errorMessage={f.integrity_error_message}
                  />
                </td>
                <td className="px-3 py-2">
                  <DmsOcrStatusBadge status={f.ocr_status ?? "not_started"} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {f.version ? `v${f.version.version_number}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {format(parseISO(f.created_at), "dd MMM yyyy")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {canPreview && isPreviewable && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={loadingAction === previewKey}
                        onClick={() => handleSignedUrl(f, "preview")}
                        title="Preview"
                      >
                        {loadingAction === previewKey
                          ? <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                          : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {canDownload && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={loadingAction === downloadKey}
                        onClick={() => handleSignedUrl(f, "download")}
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
  );
}
