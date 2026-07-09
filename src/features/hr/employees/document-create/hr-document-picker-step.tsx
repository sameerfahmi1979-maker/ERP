"use client";

import { useState, useTransition, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, CheckCircle2, AlertCircle, Clock, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HrDmsDocumentSelection } from "@/lib/hr/document-to-record/types";
import { classificationLabel } from "@/lib/hr/document-to-record/document-classifier";
import { getDmsDocumentsForEmployeeCreate } from "@/server/actions/hr/document-to-employee";
import { aggregateEmployeeDraftFromDmsDocuments } from "@/server/actions/hr/document-to-employee";
import type { HrDocumentToEmployeeReviewPayload } from "@/lib/hr/document-to-record/types";
import type { DuplicateCheckResult } from "@/lib/hr/document-to-record/duplicate-checks";

type Props = {
  selectedIds: number[];
  onToggle: (doc: HrDmsDocumentSelection) => void;
  onNext: (payload: HrDocumentToEmployeeReviewPayload & { duplicates: DuplicateCheckResult[] }) => void;
};

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

export function HrDocumentPickerStep({ selectedIds, onToggle, onNext }: Props) {
  const [search, setSearch] = useState("");
  const [isAggregating, startAggregate] = useTransition();
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["hr14a", "dms-docs-for-employee-create", search],
    queryFn: async () => {
      const result = await getDmsDocumentsForEmployeeCreate({ search, limit: 100 });
      if (!result.success) {
        setFetchError(result.error ?? "Failed to load documents");
        return [];
      }
      setFetchError(null);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const handleNext = useCallback(() => {
    if (selectedIds.length === 0) return;
    startAggregate(async () => {
      const result = await aggregateEmployeeDraftFromDmsDocuments(selectedIds);
      if (result.success && result.data) {
        onNext(result.data);
      }
    });
  }, [selectedIds, onNext]);

  const statusIcon = (doc: HrDmsDocumentSelection) => {
    if (doc.has_extraction) return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    if (doc.has_ocr) return <Clock className="h-3 w-3 text-yellow-500" />;
    return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
  };

  const statusLabel = (doc: HrDmsDocumentSelection) => {
    if (doc.has_extraction) return "AI ready";
    if (doc.has_ocr) return "OCR only";
    return "No extraction";
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Select DMS Documents</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose one or more documents already uploaded in DMS. The wizard will read existing
          extraction results to suggest employee fields.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by file name, document number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {selectedIds.length} document{selectedIds.length !== 1 ? "s" : ""} selected
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto rounded-md border border-border divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5">
              <Skeleton className="h-4 w-48 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : fetchError ? (
          <div className="px-6 py-10 text-center space-y-2">
            <ShieldAlert className="h-8 w-8 mx-auto text-destructive/60" />
            <p className="text-sm text-destructive">{fetchError}</p>
            <p className="text-xs text-muted-foreground">Check your DMS permissions or contact your administrator.</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="px-6 py-10 text-center space-y-2">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No documents found.</p>
            <p className="text-xs text-muted-foreground">
              Upload documents in DMS first, then return here to create an employee from documents.
            </p>
          </div>
        ) : (
          docs.map((doc) => {
            const isSelected = selectedIds.includes(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onToggle(doc)}
                className={cn(
                  "w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors hover:bg-muted/40",
                  isSelected && "bg-blue-50 dark:bg-blue-950/20"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors",
                    isSelected
                      ? "border-blue-500 bg-blue-500 flex items-center justify-center"
                      : "border-border bg-background"
                  )}
                >
                  {isSelected && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate">{doc.title}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                      {classificationLabel(doc.classification)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                    <span>{doc.document_no}</span>
                    {doc.document_type_name && <span>· {doc.document_type_name}</span>}
                    {doc.extracted_person_name && (
                      <span className="text-green-600 dark:text-green-400">· {doc.extracted_person_name}</span>
                    )}
                    <span className="flex items-center gap-0.5">
                      {statusIcon(doc)}
                      {statusLabel(doc)}
                    </span>
                    {doc.expiry_date && (
                      <span className={cn(isExpired(doc.expiry_date) && "text-red-600 dark:text-red-400 font-medium")}>
                        · {isExpired(doc.expiry_date) ? "Expired" : "Expires"} {doc.expiry_date}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          size="sm"
          onClick={handleNext}
          disabled={selectedIds.length === 0 || isAggregating}
          className="gap-1.5"
        >
          {isAggregating ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Extracting...
            </>
          ) : (
            "Extract & Continue"
          )}
        </Button>
      </div>
    </div>
  );
}
