"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Loader2, Activity } from "lucide-react";
import { getDmsDocumentEvents } from "@/server/actions/dms/document-events";
import { queryKeys } from "@/lib/query/query-keys";

const EVENT_LABELS: Record<string, string> = {
  document_created: "Document created",
  document_updated: "Document updated",
  archived: "Document archived",
  unarchived: "Document unarchived",
  deleted: "Document deleted",
  metadata_updated: "Metadata updated",
  link_added: "Entity link added",
  link_removed: "Entity link removed",
  tags_updated: "Tags updated",
  comment_added: "Comment added",
  comment_updated: "Comment updated",
  comment_deleted: "Comment deleted",
  status_changed: "Status changed",
  uploaded: "File uploaded",
  version_added: "Version added",
  file_uploaded: "File uploaded",
  version_uploaded: "New version linked",
  version_unlinked: "Version unlinked",
  current_version_changed: "Current version changed",
  ocr_completed: "OCR completed",
  ai_extracted: "AI extraction completed",
  approved: "Approved",
  rejected: "Rejected",
};

interface DmsDocumentAuditSectionProps {
  documentId: number | null;
}

export function DmsDocumentAuditSection({ documentId }: DmsDocumentAuditSectionProps) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.documentEvents(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsDocumentEvents(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

  if (!documentId) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Save the document to see audit events.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audit events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
        <Activity className="h-6 w-6 opacity-40" />
        <p className="text-sm">No audit events yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="relative">
        {events.map((event, index) => (
          <div key={event.id} className="relative flex gap-3 pb-4">
            {index < events.length - 1 && (
              <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
            )}
            <div className="flex-shrink-0 w-4 h-4 rounded-full bg-muted border-2 border-border mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </p>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span>{format(parseISO(event.performed_at), "dd MMM yyyy HH:mm")}</span>
                {(event.performer as { display_name?: string } | null)?.display_name && (
                  <>
                    <span>·</span>
                    <span>{(event.performer as { display_name?: string }).display_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
