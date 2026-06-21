"use client";

import { FileText, Search } from "lucide-react";
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
  selectedId: number | null;
  onSelect: (documentId: number) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptySearchMessage?: string;
};

export function DmsAttachDocumentPicker({
  search,
  onSearchChange,
  documents,
  isLoading = false,
  selectedId,
  onSelect,
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
                selected={selectedId === doc.id}
                onSelect={() => onSelect(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedId != null && !isLoading && (
        <p className="text-xs text-muted-foreground shrink-0">
          Selected document will be linked to this record. The DMS file is not duplicated.
        </p>
      )}
    </div>
  );
}

function AttachDocumentPickRow({
  doc,
  selected,
  onSelect,
}: {
  doc: AvailableDmsDocumentOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-background hover:bg-muted/40"
      )}
    >
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
        </div>
        <div className="text-xs text-muted-foreground mt-1 font-mono">{doc.document_no}</div>
      </div>
    </button>
  );
}
