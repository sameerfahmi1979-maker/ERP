"use client";

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
} from "lucide-react";
import type { DmsUploadSessionRow } from "@/server/actions/dms/upload-sessions";
import { FileTypeIcon } from "./dms-file-type-icon";
import { FileSize } from "./dms-file-size";

interface DmsUploadSessionTableProps {
  sessions: DmsUploadSessionRow[];
  onAttach: (session: DmsUploadSessionRow) => void;
  onCreateDocument: (session: DmsUploadSessionRow) => void;
  onCancel: (session: DmsUploadSessionRow) => void;
  onAiFill?: (session: DmsUploadSessionRow) => void;
  isSubmitting?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  uploaded: { label: "Uploaded", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  processing: { label: "Processing", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

export function DmsUploadSessionTable({
  sessions,
  onAttach,
  onCreateDocument,
  onCancel,
  onAiFill,
  isSubmitting,
}: DmsUploadSessionTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Copy className="h-8 w-8 opacity-30" />
        <p className="text-sm">No active upload sessions</p>
        <p className="text-xs opacity-70">Upload a file above to get started</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">File</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duplicate</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Uploaded</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires</th>
            <th className="px-4 py-2.5 w-48" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sessions.map((s) => {
            const statusInfo = STATUS_BADGE[s.status] ?? { label: s.status, className: "bg-gray-100 text-gray-600" };
            const isActionable = s.status === "uploaded" || s.status === "processing";
            return (
              <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
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
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  <FileSize bytes={s.file_size_bytes} />
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={`text-[10px] px-1.5 py-0 ${statusInfo.className}`}>
                    {statusInfo.label}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
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
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {format(parseISO(s.uploaded_at), "dd MMM, HH:mm")}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {s.expires_at
                    ? format(parseISO(s.expires_at), "dd MMM yyyy")
                    : "—"}
                </td>
                <td className="px-4 py-2.5">
                  {isActionable && (
                    <div className="flex items-center gap-1 justify-end">
                      {onAiFill && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700"
                          onClick={() => onAiFill(s)}
                          disabled={isSubmitting}
                          title="Upload & AI Fill"
                        >
                          <Bot className="h-3 w-3" />
                          AI Fill
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => onAttach(s)}
                        disabled={isSubmitting}
                        title="Attach to existing document"
                      >
                        <Paperclip className="h-3 w-3" />
                        Attach
                      </Button>
                      <Button
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
                      <Button
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
