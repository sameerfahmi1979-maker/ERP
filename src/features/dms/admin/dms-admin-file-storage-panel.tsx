"use client";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { useState, useCallback, useRef, useId } from "react";
import { DmsLoadError } from "@/features/dms/dms-load-error";
import { format, parseISO } from "date-fns";
import {
  Trash2, RefreshCw, ChevronDown, ChevronUp, Database,
  AlertTriangle, X, Check, FileX, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  adminListDmsFiles,
  adminHardDeleteDmsFile,
  type AdminFileRow,
} from "@/server/actions/dms/document-files";
import { FileSize } from "@/features/dms/upload/dms-file-size";
import { FileTypeIcon, getMimeTypeLabel } from "@/features/dms/upload/dms-file-type-icon";

const DMS_FIELDS: DmsListField[] = [
  {
    "id": "file",
    "label": "File",
    "path": "file_name",
    "type": "text",
    "width": 240,
    "required": true
  },
  {
    "id": "type",
    "label": "Type",
    "path": "mime_type",
    "type": "text",
    "width": 160
  },
  {
    "id": "size",
    "label": "Size (bytes)",
    "path": "file_size_bytes",
    "type": "number",
    "width": 160
  },
  {
    "id": "document",
    "label": "Document",
    "path": "document_no",
    "type": "text",
    "width": 160
  },
  {
    "id": "hash",
    "label": "SHA-256",
    "path": "sha256_hash",
    "type": "text",
    "width": 160
  },
  {
    "id": "deleted",
    "label": "Deleted on",
    "path": "deleted_at",
    "type": "date",
    "width": 160
  },
  {
    "id": "created",
    "label": "Created",
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

export function DmsAdminFileStoragePanel() {
  const panelId = useId();
  const requestSequence = useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [rows, setRows] = useState<AdminFileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadFiles = useCallback(async (withDeleted: boolean) => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const result = await adminListDmsFiles({ includeDeleted: withDeleted, limit: 200 });
      if (sequence !== requestSequence.current) return;
      if (result.success && result.data) {
        setRows(result.data.rows);
        setTotal(result.data.total);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (sequence === requestSequence.current) setLoadFailed(true);
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, []);

  const handleToggle = () => {
    if (!isExpanded) loadFiles(includeDeleted);
    setIsExpanded((v) => !v);
  };

  const handleToggleDeleted = (val: boolean) => {
    setIncludeDeleted(val);
    if (isExpanded) loadFiles(val);
  };

  const handleDelete = async (row: AdminFileRow) => {
    if (deletingId !== null) return;
    setActionError(null);
    if (confirmDeleteId !== row.id) {
      setConfirmDeleteId(row.id);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(row.id);
    try {
      const result = await adminHardDeleteDmsFile(row.id);
      if (result.success && result.data) {
        toast.success(
          `"${row.file_name}" permanently deleted.` +
          (result.data.storageDeleted ? " Removed from storage." : " Storage file was already missing.") +
          (result.data.aiResultsRemoved > 0 ? ` ${result.data.aiResultsRemoved} AI result(s) unlinked.` : "")
        );
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setTotal((t) => t - 1);
      } else {
        setActionError("The file was not deleted. Check its current state and your access.");
      }
    } catch {
      setActionError("The deletion could not be confirmed. Refresh to check this file before retrying.");
    } finally {
      setDeletingId(null);
    }
  };

  const listView = useDmsListView("storage-inspector", rows, DMS_FIELDS);
  const activeFiles = rows.filter((r) => !r.deleted_at).length;
  const deletedFiles = rows.filter((r) => r.deleted_at).length;
  const orphanFiles = rows.filter((r) => r.document_deleted || !r.document_id).length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 cursor-pointer transition-colors"
      >
        <button type="button" aria-expanded={isExpanded} aria-controls={panelId} onClick={handleToggle} className="flex min-w-0 flex-wrap items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-primary">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">File Storage Inspector</span>
          <Badge variant="outline" className="text-[10px] px-1.5">Admin</Badge>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {total} file{total !== 1 ? "s" : ""} total
              {orphanFiles > 0 && (
                <span className="text-amber-600 ml-2">· {orphanFiles} orphaned</span>
              )}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {isExpanded && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={(e) => { e.stopPropagation(); loadFiles(includeDeleted); }}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div id={panelId} className="p-4 space-y-4">
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Switch
                id={`${panelId}-deleted`}
                checked={includeDeleted}
                onCheckedChange={handleToggleDeleted}
              />
              <Label htmlFor={`${panelId}-deleted`} className="text-xs cursor-pointer">Show soft-deleted files</Label>
            </div>
            {rows.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  {activeFiles} active
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  {deletedFiles} soft-deleted
                </span>
                {orphanFiles > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    {orphanFiles} orphaned (doc deleted)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* What does this do */}
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Hard-delete removes the file record permanently from the database.</p>
            <p>The sha256 hash is gone — the file can be re-uploaded without triggering a duplicate warning.</p>
            <p>Storage file, AI extraction results, and the DB row are all removed. This cannot be undone.</p>
          </div>

      <DmsListTools view={listView} search />
          {/* Table */}
          {loadFailed ? <DmsLoadError subject="file storage records" retry={() => loadFiles(includeDeleted)} pending={isLoading} /> : isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : listView.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <FileX className="h-8 w-8 opacity-30" />
              <p className="text-sm">{rows.length ? "No loaded files match your filters." : "No file records found"}</p>
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <div role="region" aria-label="storage-inspector table" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth: listView.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listView.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
                <thead>
                  <ConfiguredRow columns={listView.columns} className="border-b border-border bg-muted/20">
                    <th data-column="file" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">File</th>
                    <th data-column="type" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th data-column="size" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">Size</th>
                    <th data-column="document" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">Document</th>
                    <th data-column="hash" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">SHA-256</th>
                    <th data-column="deleted" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th data-column="created" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">Created</th>
                    <th data-column="actions" className="px-3 py-2 w-28" />
                  </ConfiguredRow>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {listView.rows.map((row) => {
                    const isConfirming = confirmDeleteId === row.id;
                    const isDeleting = deletingId === row.id;
                    return (
                      <ConfiguredRow columns={listView.columns}
                        key={row.id}
                        className={`transition-colors ${
                          isConfirming ? "bg-destructive/5" :
                          row.deleted_at ? "bg-muted/10 opacity-60" :
                          row.document_deleted ? "bg-amber-50/50 dark:bg-amber-950/10" :
                          "hover:bg-muted/10"
                        }`}
                      >
                        <td data-column="file" className="px-3 py-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileTypeIcon mimeType={row.mime_type} />
                            <span className="truncate max-w-[160px] font-medium">{row.file_name}</span>
                          </div>
                        </td>
                        <td data-column="type" className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {getMimeTypeLabel(row.mime_type)}
                          </Badge>
                        </td>
                        <td data-column="size" className="px-3 py-2 text-muted-foreground">
                          <FileSize bytes={row.file_size_bytes} />
                        </td>
                        <td data-column="document" className="px-3 py-2">
                          {row.document_id ? (
                            <div className="flex items-center gap-1">
                              <a
                                href={`/dms/documents/record/${row.document_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.document_no ?? `#${row.document_id}`}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                              {row.document_deleted && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-300 text-red-600">deleted</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">no document</span>
                          )}
                        </td>
                        <td data-column="hash" className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {row.sha256_hash ? row.sha256_hash.substring(0, 12) + "…" : "—"}
                        </td>
                        <td data-column="deleted" className="px-3 py-2">
                          {row.deleted_at ? (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-300 text-red-500">soft-deleted</Badge>
                          ) : row.document_deleted ? (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-300 text-amber-600">orphaned</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-300 text-green-600">active</Badge>
                          )}
                        </td>
                        <td data-column="created" className="px-3 py-2 text-muted-foreground">
                          {format(parseISO(row.created_at), "dd MMM yyyy")}
                        </td>
                        <td data-column="actions" className="px-3 py-2">
                          {!isConfirming ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-destructive/70 hover:text-destructive hover:bg-destructive/10 text-[10px] gap-1"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(row.id)}
                            >
                              {isDeleting
                                ? <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                : <Trash2 className="h-2.5 w-2.5" />}
                              Delete
                            </Button>
                          ) : (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                              <Button aria-label="Confirm hard-delete"
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(row)}
                                title="Confirm hard-delete"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button aria-label="Cancel"
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => setConfirmDeleteId(null)}
                                title="Cancel"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </span>
                          )}
                        </td>
                      </ConfiguredRow>
                    );
                  })}
                </tbody>
              </table></div>
              {total > rows.length && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/50 bg-muted/10">
                  Showing {rows.length} of {total} records. Load more from the database if needed.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
