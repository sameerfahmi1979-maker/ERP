"use client";
import {useState,useEffect,useRef} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useServerPage,canonicalReadParams} from "@/hooks/use-server-page";
import {DmsLoadError} from "@/features/dms/dms-load-error";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  PlusCircle,
  XCircle,
  ExternalLink,
  Copy,
  AlertTriangle,
  Bot,
  ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import type { DmsUploadSessionRow } from "@/server/actions/dms/upload-sessions";
import { FileTypeIcon } from "./dms-file-type-icon";
import { FileSize } from "./dms-file-size";
import { useClock } from "@/hooks/use-clock";

interface DmsUploadSessionTableProps {
  sessions: DmsUploadSessionRow[];
  onAttach: (session: DmsUploadSessionRow) => void;
  onCreateDocument: (session: DmsUploadSessionRow) => void;
  onCancel: (session: DmsUploadSessionRow) => void;
  onAiFill?: (session: DmsUploadSessionRow) => void;
  isSubmitting?: boolean;
  onReadAvailable?: (available:boolean)=>void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  uploaded: { label: "Uploaded", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  processing: { label: "Processing", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

const DMS_LIST_FIELDS: DmsListField[] = [
  {
    "id": "original_filename",
    "label": "File",
    "path": "original_filename",
    "type": "text",
    "width": 250,
    "required": true
  },
  {
    "id": "file_size_bytes",
    "label": "Size (bytes)",
    "path": "file_size_bytes",
    "type": "number",
    "width": 160
  },
  {
    "id": "status",
    "label": "Status",
    "path": "status",
    "type": "text",
    "width": 160
  },
  {
    "id": "is_duplicate",
    "label": "Duplicate",
    "path": "is_duplicate",
    "type": "select",
    "options": [{value:"true",label:"Yes"},{value:"false",label:"No"}],
    "width": 160
  },
  {
    "id": "uploaded_at",
    "label": "Uploaded",
    "path": "uploaded_at",
    "type": "date",
    "width": 160
  },
  {
    "id": "expires_at",
    "label": "Expires",
    "path": "expires_at",
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

export function DmsUploadSessionTable({
  sessions,
  onAttach,
  onCreateDocument,
  onCancel,
  onAiFill,
  isSubmitting,
  onReadAvailable,
}: DmsUploadSessionTableProps) {
  const qc=useQueryClient();
  const view=useDmsListView("upload-sessions",[],DMS_LIST_FIELDS,{serverFiltered:true});
  const criteria=canonicalReadParams({search:view.search,columnFilters:view.filters});
  const [position,setPosition]=useState({criteria,page:1});
  const page=position.criteria===criteria?position.page:1;
  const read=useServerPage<DmsUploadSessionRow>({resource:"dms-inbox",params:{...JSON.parse(criteria),page,pageSize:25},seedParams:{},seed:{rows:[],totalCount:0,page:1,pageSize:25},updatedAt:0,keyPrefix:["dms","inbox","sessions"]});
  const ready=!read.isBusy&&!read.isError&&!!read.data;
  useEffect(()=>{onReadAvailable?.(!read.isError);},[onReadAvailable,read.isError]);
  const total=ready?read.data!.totalCount:undefined;
  const pages=Math.max(1,Math.ceil((total??0)/25));
  if(ready&&page>pages)setPosition({criteria,page:pages});
  // Confirmed uploads/cancels change the parent's synthetic row array. Retire
  // the counted page rather than treating the local array as a complete inbox.
  const priorSessions=useRef(sessions);
  useEffect(()=>{if(priorSessions.current===sessions)return;priorSessions.current=sessions;void qc.invalidateQueries({queryKey:["dms","inbox","sessions"]});},[qc,sessions]);
  const listView={...view,rows:ready?read.data!.rows:[],totalCount:total};
  const now = useClock();
  if (read.isError) return <DmsLoadError subject="upload sessions" pending={read.isBusy} retry={()=>read.refetch()} />;
  if (ready && total === 0 && !view.search && !Object.values(view.filters).some(Boolean)) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Copy className="h-8 w-8 opacity-30" />
        <p className="text-sm">No active upload sessions</p>
        <p className="text-xs opacity-70">Upload a file above to get started</p>
      </div>
    );
  }

  return (
    <><DmsListTools view={listView} search /><p className="text-xs text-muted-foreground">Search file name, session code or status. Date filters use UTC dates.</p>
    {read.isBusy&&<p role="status">Loading upload sessions…</p>}
    <div className="flex items-center gap-2 mb-2"><Button variant="outline" disabled={!ready||page<=1} onClick={()=>setPosition({criteria,page:page-1})}>Previous</Button><span>Page {page}{ready?` of ${pages}`:""}</span><Button variant="outline" disabled={!ready||page>=pages} onClick={()=>setPosition({criteria,page:page+1})}>Next</Button><Button variant="outline" disabled={read.isBusy} onClick={()=>read.refetch()}>Refresh sessions</Button></div><div className="rounded-md border border-border overflow-auto">
      <div role="region" aria-label="upload-sessions table" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth: listView.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listView.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
        <thead>
          <ConfiguredRow columns={listView.columns} className="border-b border-border bg-muted/30">
            <th data-column="original_filename" className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">File</th>
            <th data-column="file_size_bytes" className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</th>
            <th data-column="status" className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
            <th data-column="is_duplicate" className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duplicate</th>
            <th data-column="uploaded_at" className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Uploaded</th>
            <th data-column="expires_at" className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires</th>
            <th data-column="actions" className="px-4 py-2.5 w-48" />
          </ConfiguredRow>
        </thead>
        <tbody className="divide-y divide-border/50">{listView.rows.length === 0 && <tr><td colSpan={listView.visible.length} className="p-4 text-center text-sm text-muted-foreground">No loaded records match your filters.</td></tr>}
          {listView.rows.map((s) => {
            const statusInfo = STATUS_BADGE[s.status] ?? { label: s.status, className: "bg-gray-100 text-gray-600" };
            const isActionable = s.status === "uploaded" || s.status === "processing";
            const isAiReviewed = s.intake_status === "review_pending";
            // SPEED.2K: an AI run is in flight for this session (status updated <5 min
            // ago) — block a second AI Fill click that would spawn a duplicate pipeline.
            const isAiRunning =
              (s.intake_status === "ocr_processing" || s.intake_status === "ai_processing") &&
              (now === 0 || now - new Date(s.updated_at).getTime() < 5 * 60 * 1000);
            return (
              <ConfiguredRow columns={listView.columns} key={s.id} className="hover:bg-muted/20 transition-colors">
                <td data-column="original_filename" className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileTypeIcon mimeType={s.mime_type} />
                    <div className="min-w-0">
                      <p className="font-medium truncate max-w-[200px]">{s.original_filename}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {s.session_code.substring(0, 8)}…
                      </p>
                    </div>
                  </div>
                </td>
                <td data-column="file_size_bytes" className="px-4 py-2.5 text-xs text-muted-foreground">
                  <FileSize bytes={s.file_size_bytes} />
                </td>
                <td data-column="status" className="px-4 py-2.5">
                  <Badge className={`text-[10px] px-1.5 py-0 ${statusInfo.className}`}>
                    {statusInfo.label}
                  </Badge>
                </td>
                <td data-column="is_duplicate" className="px-4 py-2.5">
                  {s.is_duplicate ? (
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      {s.duplicate_document ? (
                        <a
                          href={`/dms/documents/record/${s.duplicate_document.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-amber-600 hover:underline flex items-center gap-0.5"
                        >
                          {s.duplicate_document.document_no}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-amber-600">Duplicate</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td data-column="uploaded_at" className="px-4 py-2.5 text-xs text-muted-foreground">
                  {format(parseISO(s.uploaded_at), "dd MMM, HH:mm")}
                </td>
                <td data-column="expires_at" className="px-4 py-2.5 text-xs text-muted-foreground">
                  {s.expires_at
                    ? format(parseISO(s.expires_at), "dd MMM yyyy")
                    : "—"}
                </td>
                <td data-column="actions" className="px-4 py-2.5">
                  {isActionable && (
                    <div className="flex items-center gap-1 justify-end">
                      {/* AI review already complete — show direct Review link instead of re-running AI */}
                      {isAiReviewed ? (
                        <Link href={`/dms/intake/${s.session_code}`}>
                          <Button aria-label="AI review is ready — click to review and create document"
                            size="sm"
                            className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                            title="AI review is ready — click to review and create document"
                          >
                            <ClipboardCheck className="h-3 w-3" />
                            Review
                          </Button>
                        </Link>
                      ) : (
                        onAiFill && (
                          <Button aria-label={isAiRunning ? "AI is already analyzing this file — please wait" : "Upload & AI Fill"}
                            size="sm"
                            variant="default"
                            className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700"
                            onClick={() => onAiFill(s)}
                            disabled={isSubmitting || isAiRunning}
                            title={isAiRunning ? "AI is already analyzing this file — please wait" : "Upload & AI Fill"}
                          >
                            {isAiRunning ? (
                              <>
                                <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                                AI Running…
                              </>
                            ) : (
                              <>
                                <Bot className="h-3 w-3" />
                                AI Fill
                              </>
                            )}
                          </Button>
                        )
                      )}
                      <Button aria-label={
                          isAiReviewed
                            ? "Attach to existing document"
                            : "Run \"Upload & AI Fill\" first to attach this file as a document version"
                        }
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => onAttach(s)}
                        disabled={isSubmitting || !isAiReviewed}
                        title={
                          isAiReviewed
                            ? "Attach to existing document"
                            : "Run \"Upload & AI Fill\" first to attach this file as a document version"
                        }
                      >
                        <Paperclip className="h-3 w-3" />
                        Attach
                      </Button>
                      <Button aria-label="Create new document from this upload"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => onCreateDocument(s)}
                        disabled={isSubmitting}
                        title="Create new document from this upload"
                      >
                        <PlusCircle className="h-3 w-3" />
                        New Doc
                      </Button>
                      <Button aria-label="Cancel upload"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => onCancel(s)}
                        disabled={isSubmitting}
                        title="Cancel upload"
                      >
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                  {s.status === "completed" && (
                    <span className="text-xs text-green-600 font-medium">Attached ✓</span>
                  )}
                  {(s.status === "cancelled" || s.status === "expired") && (
                    <span className="text-xs text-muted-foreground">{statusInfo.label}</span>
                  )}
                </td>
              </ConfiguredRow>
            );
          })}
        </tbody>
      </table></div>
    </div></>
  );
}
