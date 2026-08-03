"use client";

/**
 * HR.DOC_BROWSER.1 — Column 2: unified document list for the selected entity.
 *
 * Sources (labelled per row): DMS links, HR identity docs (D2), dependent links (D1).
 */

import { FileText, FolderOpen, IdCard, Loader2, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DmsDocumentStatusBadge } from "@/features/dms/documents/dms-document-status-badge";
import { DmsExpiryBadge } from "@/features/dms/documents/dms-expiry-badge";
import type { HrDocBrowserDocument } from "@/server/actions/hr/doc-browser";
import type { BrowserEntitySelection } from "./hr-doc-browser-types";

interface HrDocBrowserDocListProps {
  entity: BrowserEntitySelection | null;
  documents: HrDocBrowserDocument[];
  isLoading: boolean;
  /** Index-based selection — identity rows can have a null document id */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function HrDocBrowserDocList({
  entity,
  documents,
  isLoading,
  selectedIndex,
  onSelect,
}: HrDocBrowserDocListProps) {
  if (!entity) {
    return (
      <EmptyColumn
        icon={<FolderOpen className="h-8 w-8 opacity-25" />}
        text="Select an employee or dependent to see their documents."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-xs">Loading documents…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Entity header */}
      <div className="px-3 py-2.5 border-b border-border/60 shrink-0">
        <p className="text-sm font-semibold truncate">{entity.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {entity.subtitle}
          {" · "}
          {documents.length} document{documents.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Document rows */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No documents linked yet. Link documents from the {entity.type === "employee" ? "employee profile" : "dependent record"}.
          </p>
        ) : (
          documents.map((doc, index) => {
            const isSelected = selectedIndex === index;
            return (
              <button
                key={`${doc.source}-${doc.id ?? "hr"}-${index}`}
                onClick={() => onSelect(index)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-l-2 border-b border-b-border/40 transition-colors",
                  isSelected
                    ? "bg-primary/10 border-l-primary"
                    : "border-l-transparent hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {doc.source === "hr_identity" ? (
                    <IdCard className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium truncate flex-1 min-w-0">
                    {doc.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {doc.typeNameEn && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      {doc.typeNameEn}
                    </Badge>
                  )}
                  {doc.source === "hr_identity" && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-950/30"
                    >
                      HR Identity
                    </Badge>
                  )}
                  {doc.status && <DmsDocumentStatusBadge status={doc.status} />}
                  <DmsExpiryBadge expiryDate={doc.expiryDate} />
                  {doc.files.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                      <Paperclip className="h-2.5 w-2.5" />
                      {doc.files.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyColumn({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-muted-foreground">
      {icon}
      <p className="text-xs text-center">{text}</p>
    </div>
  );
}
