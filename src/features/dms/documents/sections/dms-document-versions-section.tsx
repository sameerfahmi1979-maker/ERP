"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Upload, CheckCircle2, Star, Eye, Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsDocumentVersions,
  getDmsDocumentFileSignedUrl,
  setDmsDocumentCurrentVersion,
  type DmsDocumentVersionRow,
  type DmsDocumentFileRow,
} from "@/server/actions/dms/document-files";
import { getDmsDocumentFiles } from "@/server/actions/dms/document-files";
import { FileSize } from "@/features/dms/upload/dms-file-size";
import { FileTypeIcon } from "@/features/dms/upload/dms-file-type-icon";
import { DmsUploadNewVersionDialog } from "@/features/dms/upload/dms-upload-new-version-dialog";
import {
  invalidateDmsDocumentFiles,
  invalidateDmsDocumentVersions,
} from "@/lib/query/invalidation";

const PREVIEWABLE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/tiff", "image/webp"];

interface DmsDocumentVersionsSectionProps {
  documentId: number;
  documentNo?: string;
  canUpload?: boolean;
  canEdit?: boolean;
}

export function DmsDocumentVersionsSection({
  documentId,
  documentNo = "",
  canUpload = true,
  canEdit = false,
}: DmsDocumentVersionsSectionProps) {
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: queryKeys.dms.documentVersions(documentId),
    queryFn: async () => {
      const result = await getDmsDocumentVersions(documentId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: files = [] } = useQuery({
    queryKey: queryKeys.dms.documentFiles(documentId),
    queryFn: async () => {
      const result = await getDmsDocumentFiles(documentId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  // Group files by version_id for display
  const filesByVersion: Record<number, DmsDocumentFileRow[]> = {};
  for (const f of files) {
    if (f.version_id != null) {
      if (!filesByVersion[f.version_id]) filesByVersion[f.version_id] = [];
      filesByVersion[f.version_id].push(f);
    }
  }

  const handlePreviewDownload = async (fileId: number, fileName: string, action: "preview" | "download") => {
    const key = `${fileId}-${action}`;
    setLoadingAction(key);
    try {
      const result = await getDmsDocumentFileSignedUrl(fileId, action);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Failed to generate URL");
        return;
      }
      if (action === "preview") {
        window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = result.data.signedUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSetCurrent = async (versionId: number) => {
    const result = await setDmsDocumentCurrentVersion(documentId, versionId);
    if (result.success) {
      toast.success("Current version updated");
      invalidateDmsDocumentVersions(queryClient, documentId);
      invalidateDmsDocumentFiles(queryClient, documentId);
    } else {
      toast.error(result.error ?? "Failed to update current version");
    }
  };

  if (versionsLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        Loading versions…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: Upload New Version */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {versions.length === 0
            ? "No versions yet"
            : `${versions.length} version${versions.length !== 1 ? "s" : ""}`}
        </p>
        {canUpload && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setUploadDialogOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload New Version
          </Button>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground rounded-md border border-dashed border-muted-foreground/30">
          <Upload className="h-8 w-8 opacity-30" />
          <div className="text-center">
            <p className="text-sm font-medium">No versions yet</p>
            <p className="text-xs mt-1 opacity-70">
              Click &ldquo;Upload New Version&rdquo; above to add the first file version.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((v: DmsDocumentVersionRow) => {
            const vFiles = filesByVersion[v.id] ?? [];
            const primaryFile = vFiles[0];
            return (
              <div
                key={v.id}
                className={`rounded-md border p-3 space-y-2 transition-colors ${
                  v.is_current
                    ? "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {/* Version header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold">v{v.version_number}</span>
                    {v.is_current && (
                      <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-300 flex items-center gap-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Current
                      </Badge>
                    )}
                    {v.version_label && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {v.version_label}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(v.created_at), "dd MMM yyyy")}
                    </span>
                    {v.creator && (
                      <span className="text-xs text-muted-foreground">
                        by {(v.creator as { full_name: string | null }).full_name ?? "—"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && !v.is_current && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => handleSetCurrent(v.id)}
                        title="Set as current version"
                      >
                        <Star className="h-3 w-3" /> Set Current
                      </Button>
                    )}
                  </div>
                </div>

                {/* Change notes */}
                {v.change_notes && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
                    {v.change_notes}
                  </p>
                )}

                {/* Files in this version */}
                {vFiles.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {vFiles.map((f) => {
                      const isPreviewable = PREVIEWABLE_TYPES.includes(f.mime_type);
                      const previewKey = `${f.id}-preview`;
                      const downloadKey = `${f.id}-download`;
                      return (
                        <div
                          key={f.id}
                          className="flex items-center gap-2 pl-2 py-1.5 rounded bg-muted/10 border border-border/50"
                        >
                          <FileTypeIcon mimeType={f.mime_type} className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{f.file_name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <FileSize bytes={f.file_size_bytes} />
                              {f.sha256_hash && (
                                <span className="font-mono">{f.sha256_hash.substring(0, 10)}…</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isPreviewable && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                title="Preview"
                                disabled={loadingAction === previewKey}
                                onClick={() => handlePreviewDownload(f.id, f.file_name, "preview")}
                              >
                                {loadingAction === previewKey
                                  ? <div className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                                  : <Eye className="h-3 w-3" />}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="Download"
                              disabled={loadingAction === downloadKey}
                              onClick={() => handlePreviewDownload(f.id, f.file_name, "download")}
                            >
                              {loadingAction === downloadKey
                                ? <div className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                                : <Download className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {vFiles.length === 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 pl-2">
                    <FileText className="h-3 w-3" />
                    No files in this version
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload New Version Dialog */}
      <DmsUploadNewVersionDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        documentId={documentId}
        documentNo={documentNo}
        onSuccess={() => {
          invalidateDmsDocumentVersions(queryClient, documentId);
          invalidateDmsDocumentFiles(queryClient, documentId);
        }}
      />
    </div>
  );
}
