"use client";

import { FileText, Search, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { AvailableDmsDocumentOption } from "@/server/actions/dms/entity-documents";
import { cn } from "@/lib/utils";

type DmsAttachDocumentPickerProps = {
  search: string;
  onSearchChange: (value: string) => void;
  documents: AvailableDmsDocumentOption[];
  isLoading?: boolean;
  /** Multi-select: document IDs currently ticked */
  selectedIds: number[];
  /** Toggle a document's selected state */
  onToggle: (documentId: number) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptySearchMessage?: string;
};

export function DmsAttachDocumentPicker({
  search,
  onSearchChange,
  documents,
  isLoading = false,
  selectedIds,
  onToggle,
  searchPlaceholder = "Search by document number or title...",
  emptyMessage = "No available documents found. All documents may already be linked to this record.",
  emptySearchMessage = "No matching documents found. Try a different search term.",
}: DmsAttachDocumentPickerProps) {
  const trimmedSearch = search.trim();
  const showEmpty = !isLoading && documents.length === 0;

  return (
    <div className="flex flex-col gap-3 min-h-[420px]">
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={searchPlaceholder}
          className="pl-9 h-10"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          autoFocus
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {selectedIds.length} document{selectedIds.length !== 1 ? "s" : ""} selected
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-[360px] rounded-lg border bg-muted/10 overflow-hidden">
        {isLoading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && showEmpty && (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {trimmedSearch ? emptySearchMessage : emptyMessage}
          </div>
        )}

        {!isLoading && documents.length > 0 && (
          <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
            {documents.map((doc) => (
              <AttachDocumentPickRow
                key={doc.id}
                doc={doc}
                selected={selectedIds.includes(doc.id)}
                onToggle={() => onToggle(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && !isLoading && (
        <p className="text-xs text-muted-foreground shrink-0">
          Selected document{selectedIds.length !== 1 ? "s" : ""} will be linked to this record. The DMS file{selectedIds.length !== 1 ? "s are" : " is"} not duplicated.
        </p>
      )}
    </div>
  );
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function extractionBadge(doc: AvailableDmsDocumentOption) {
  if (doc.has_extraction) {
    return (
      <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> AI ready
      </Badge>
    );
  }
  if (doc.has_ocr) {
    return (
      <Badge variant="outline" className="text-[10px] text-yellow-700 border-yellow-300">
        <Clock className="h-2.5 w-2.5 mr-0.5" /> OCR only
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> No extraction
    </Badge>
  );
}

function AttachDocumentPickRow({
  doc,
  selected,
  onToggle,
}: {
  doc: AvailableDmsDocumentOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const expired = isExpired(doc.expiry_date);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-background hover:bg-muted/40"
      )}
    >
      {/* Tick mark checkbox */}
      <div
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors flex items-center justify-center",
          selected ? "border-primary bg-primary" : "border-border bg-background"
        )}
      >
        {selected && (
          <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{doc.title || doc.document_no}</span>
          {doc.document_type_name && (
            <Badge variant="outline" className="text-xs">
              {doc.document_type_name}
            </Badge>
          )}
          {doc.status && (
            <Badge variant="secondary" className="text-xs capitalize">
              {doc.status.replace(/_/g, " ")}
            </Badge>
          )}
          {extractionBadge(doc)}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span className="font-mono">{doc.document_no}</span>
          {doc.extracted_person_name && (
            <span className="text-green-600 dark:text-green-400">· {doc.extracted_person_name}</span>
          )}
          {doc.expiry_date && (
            <span className={cn(expired && "text-red-600 dark:text-red-400 font-medium")}>
              · {expired ? "Expired" : "Expires"} {doc.expiry_date}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
