"use client";

import { useId, useRef, useState } from "react";
import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
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
  const panelId = useId(), flight = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [preview, setPreview] = useState<CleanupResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const [isMarkingExpired, setIsMarkingExpired] = useState(false);
  const busy = isLoadingPreview || isRunning || isMarkingExpired;
  const view = useDmsListView("cleanup-preview", preview?.candidates ?? [], CLEANUP_FIELDS);

  const handleMarkExpired = async () => {
    if (flight.current) return;
    if (!window.confirm("Mark eligible temporary upload sessions as expired? Review cleanup candidates afterward before deleting files.")) return;
    flight.current = true; setFailure(null); setPreview(null);
    setIsMarkingExpired(true);
    try {
      const result = await markExpiredDmsUploadSessions();
      if (result.success) {
        toast.success(`Marked ${result.data?.marked ?? 0} sessions as expired`);
      } else {
        setFailure("Sessions could not be marked expired. Check your access and try again.");
      }
    } catch {
      setFailure("The operation could not be confirmed. Refresh the preview before retrying.");
    } finally {
      setIsMarkingExpired(false);
      flight.current = false;
    }
  };

  const handlePreview = async () => {
    if (flight.current) return;
    flight.current = true; setFailure(null); setPreview(null);
    setIsLoadingPreview(true);
    try {
      const result = await getDmsCleanupPreview();
      if (result.success && result.data) {
        setPreview(result.data);
      } else {
        setFailure("Cleanup candidates could not be loaded. Try previewing again.");
      }
    } catch {
      setFailure("Cleanup candidates could not be loaded. Try previewing again.");
    } finally {
      setIsLoadingPreview(false);
      flight.current = false;
    }
  };

  const handleCleanup = async () => {
    if (flight.current || !preview?.candidates.length) return;
    if (!confirm("This will delete temp files from dms-temp storage. Permanent DMS files will NOT be affected. Continue?")) return;

    flight.current = true; setFailure(null); setLastResult(null); setIsRunning(true);
    try {
      const result = await cleanupDmsExpiredUploadSessions({ dryRun: false, limit: 100 });
      if (result.success && result.data) {
        setLastResult(result.data);
        setPreview(null);
        toast.success(`Cleanup complete: ${result.data.cleaned} files cleaned, ${formatBytes(result.data.total_bytes_freed)} freed`);
      } else {
        setFailure("Cleanup did not complete. Reload the preview before retrying.");
      }
    } catch {
      setFailure("Cleanup could not be confirmed. Reload the preview before retrying.");
    } finally {
      setIsRunning(false);
      setPreview(null); flight.current = false;
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
        aria-expanded={isExpanded}
        aria-controls={panelId}
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
        <div id={panelId} className="px-4 pb-4 pt-1 space-y-4 border-t border-border">
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
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
              disabled={busy}
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
              disabled={busy}
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
              disabled={busy || !preview?.candidates.length}
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

              <p className="text-xs text-muted-foreground">Filters affect only this preview. Run Cleanup rechecks eligibility and processes up to 100 eligible sessions; it does not use the filtered rows as a selection.</p>
              <DmsListTools view={view} search />
              {view.rows.length > 0 ? (
                <div role="region" aria-label="Cleanup candidates" tabIndex={0} className="rounded-sm border border-border max-w-full overflow-auto">
                  <table className="w-full text-xs" style={{minWidth:view.visible.reduce((sum,c)=>sum+c.width,0)}}>
                    <colgroup>{view.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
                    <thead>
                      <ConfiguredRow columns={view.columns} className="bg-muted/20 border-b border-border">
                        {view.visible.map(c=><th key={c.id} data-column={c.id} className="text-left px-3 py-2 font-medium text-muted-foreground">{c.label}</th>)}
                      </ConfiguredRow>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {view.rows.map((c: SessionCleanupCandidate) => (
                        <ConfiguredRow columns={view.columns} key={c.id} className="hover:bg-muted/10">
                          <td data-column="session" className="px-3 py-1.5 font-mono text-muted-foreground">{c.session_code}</td>
                          <td data-column="file" className="px-3 py-1.5 truncate max-w-[160px]" title={c.original_filename}>{c.original_filename}</td>
                          <td data-column="status" className="px-3 py-1.5">
                            <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                          </td>
                          <td data-column="size" className="px-3 py-1.5 text-muted-foreground">
                            <FileSize bytes={c.file_size_bytes} />
                          </td>
                          <td data-column="uploaded" className="px-3 py-1.5 text-muted-foreground">
                            {format(parseISO(c.uploaded_at), "dd MMM yyyy HH:mm")}
                          </td>
                        </ConfiguredRow>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  {preview.candidates.length ? "No loaded candidates match your filters." : "No sessions are currently eligible for cleanup."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CLEANUP_FIELDS: DmsListField[] = [
  {id:"session",label:"Session",path:"session_code",required:true,width:180},
  {id:"file",label:"File",path:"original_filename",width:240},
  {id:"status",label:"Status",path:"status",width:140},
  {id:"size",label:"Size (bytes)",path:"file_size_bytes",type:"number",width:130},
  {id:"uploaded",label:"Uploaded",path:"uploaded_at",type:"date",width:180},
];
