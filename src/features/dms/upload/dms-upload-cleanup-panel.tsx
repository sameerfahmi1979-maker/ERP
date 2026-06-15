"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Eye, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  cleanupDmsExpiredUploadSessions,
  markExpiredDmsUploadSessions,
  getDmsCleanupPreview,
  type SessionCleanupCandidate,
  type CleanupResult,
} from "@/server/actions/dms/session-cleanup";
import { FileSize } from "./dms-file-size";

interface DmsUploadCleanupPanelProps {
  isAdmin?: boolean;
}

export function DmsUploadCleanupPanel({ isAdmin = false }: DmsUploadCleanupPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [preview, setPreview] = useState<CleanupResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const [isMarkingExpired, setIsMarkingExpired] = useState(false);

  const handleMarkExpired = async () => {
    setIsMarkingExpired(true);
    try {
      const result = await markExpiredDmsUploadSessions();
      if (result.success) {
        toast.success(`Marked ${result.data?.marked ?? 0} sessions as expired`);
      } else {
        toast.error(result.error ?? "Failed to mark expired sessions");
      }
    } finally {
      setIsMarkingExpired(false);
    }
  };

  const handlePreview = async () => {
    setIsLoadingPreview(true);
    try {
      const result = await getDmsCleanupPreview();
      if (result.success && result.data) {
        setPreview(result.data);
      } else {
        toast.error(result.error ?? "Failed to load cleanup preview");
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("This will delete temp files from dms-temp storage. Permanent DMS files will NOT be affected. Continue?")) return;

    setIsRunning(true);
    try {
      const result = await cleanupDmsExpiredUploadSessions({ dryRun: false, limit: 100 });
      if (result.success && result.data) {
        setLastResult(result.data);
        setPreview(null);
        toast.success(`Cleanup complete: ${result.data.cleaned} files cleaned, ${formatBytes(result.data.total_bytes_freed)} freed`);
      } else {
        toast.error(result.error ?? "Cleanup failed");
      }
    } finally {
      setIsRunning(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isAdmin) return null;

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/20 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          <span>Temp File Cleanup</span>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Admin</Badge>
        </div>
        <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border">
          {/* Info */}
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Cleanup removes temp files from <code className="font-mono">dms-temp</code> bucket only.
              Permanent DMS files in <code className="font-mono">dms-documents</code> are never deleted.
              Only sessions with status completed/cancelled/expired/failed older than their threshold are eligible.
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMarkExpired}
              disabled={isMarkingExpired}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isMarkingExpired ? "animate-spin" : ""}`} />
              Mark Expired Sessions
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={isLoadingPreview}
              className="gap-1.5"
            >
              <Eye className={`h-3.5 w-3.5 ${isLoadingPreview ? "animate-spin" : ""}`} />
              Preview Cleanup Candidates
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleCleanup}
              disabled={isRunning}
              className="gap-1.5"
            >
              <Trash2 className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} />
              Run Cleanup
            </Button>
          </div>

          {/* Last result */}
          {lastResult && (
            <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Last run: {lastResult.cleaned} cleaned · {lastResult.failed} failed · {formatBytes(lastResult.total_bytes_freed)} freed
            </div>
          )}

          {/* Preview results */}
          {preview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  {preview.candidates.length} candidate(s) eligible for cleanup
                  (from {preview.scanned} scanned)
                </span>
              </div>

              {preview.candidates.length > 0 ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/20 border-b border-border">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Session</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">File</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Size</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {preview.candidates.map((c: SessionCleanupCandidate) => (
                        <tr key={c.id} className="hover:bg-muted/10">
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.session_code}</td>
                          <td className="px-3 py-1.5 truncate max-w-[160px]">{c.original_filename}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            <FileSize bytes={c.file_size_bytes} />
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {format(parseISO(c.uploaded_at), "dd MMM yyyy HH:mm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No sessions are currently eligible for cleanup.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
