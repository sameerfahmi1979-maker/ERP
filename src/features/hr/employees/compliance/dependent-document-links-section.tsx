"use client";

/**
 * HR.DOCLINK.1B — Linked Documents section for the Add/Edit Dependent dialog.
 *
 * Multi-select document linking for a dependent:
 *  - Lists documents currently linked (entity_type='employee_dependent')
 *  - "+ Link Documents" expands an inline multi-select picker (checkbox rows,
 *    search) — several documents can be staged AT ONCE, no one-at-a-time
 *  - Additions/removals are STAGED locally and applied by the parent dialog
 *    on Save via applyEmployeeDependentDocumentLinks (per user requirement:
 *    "once I save, the document will be linked")
 *
 * Inline expansion (not a nested dialog) keeps the standard child-dialog
 * z-index contract intact.
 */

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Plus, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DmsAttachDocumentPicker } from "@/features/dms/entity-documents/dms-attach-document-picker";
import {
  getAvailableDmsDocumentsForLink,
  type AvailableDmsDocumentOption,
} from "@/server/actions/dms/entity-documents";
import {
  listEmployeeDependentDocumentLinks,
  type DependentDocumentLinkRow,
} from "@/server/actions/hr/compliance";

export type DependentDocLinkChanges = {
  addDocumentIds: number[];
  removeDocumentIds: number[];
};

export const EMPTY_DEP_LINK_CHANGES: DependentDocLinkChanges = {
  addDocumentIds: [],
  removeDocumentIds: [],
};

type DependentDocumentLinksSectionProps = {
  /** null in Add mode (dependent not created yet) */
  dependentId: number | null;
  /** Reports the staged changes; parent applies them on Save */
  onChangesChange: (changes: DependentDocLinkChanges) => void;
};

export function DependentDocumentLinksSection({
  dependentId,
  onChangesChange,
}: DependentDocumentLinksSectionProps) {
  const [stagedAdds, setStagedAdds] = useState<AvailableDmsDocumentOption[]>([]);
  const [stagedRemoveIds, setStagedRemoveIds] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  // Existing links (edit mode only)
  const { data: existingLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: ["hr", "dependent-doc-links", dependentId],
    queryFn: async () => {
      const r = await listEmployeeDependentDocumentLinks(dependentId!);
      return r.success ? r.data ?? [] : [];
    },
    enabled: dependentId != null,
  });

  // Available documents for the picker (already-linked docs excluded server-side)
  const { data: availableDocs = [], isLoading: availableLoading } = useQuery({
    queryKey: ["hr", "dependent-doc-links-available", dependentId ?? 0, deferredSearch],
    queryFn: async () => {
      const r = await getAvailableDmsDocumentsForLink(
        "employee_dependent",
        dependentId ?? 0,
        deferredSearch
      );
      return r.success ? r.data ?? [] : [];
    },
    enabled: pickerOpen,
    staleTime: 15_000,
  });

  // Report staged changes upward whenever they mutate
  useEffect(() => {
    onChangesChange({
      addDocumentIds: stagedAdds.map((d) => d.id),
      removeDocumentIds: [...stagedRemoveIds],
    });
  }, [stagedAdds, stagedRemoveIds, onChangesChange]);

  const stagedAddIds = useMemo(() => stagedAdds.map((d) => d.id), [stagedAdds]);

  // Picker shows the server results plus any ticked docs that dropped out of
  // the current search, so selections never silently disappear.
  const pickerDocs = useMemo(() => {
    const ids = new Set(availableDocs.map((d) => d.id));
    return [...stagedAdds.filter((d) => !ids.has(d.id)), ...availableDocs];
  }, [availableDocs, stagedAdds]);

  const togglePick = (documentId: number) => {
    const doc = availableDocs.find((d) => d.id === documentId);
    setStagedAdds((prev) => {
      if (prev.some((d) => d.id === documentId)) {
        return prev.filter((d) => d.id !== documentId);
      }
      return doc ? [...prev, doc] : prev;
    });
  };

  const toggleRemoval = (documentId: number) => {
    setStagedRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const activeCount =
    existingLinks.filter((l) => !stagedRemoveIds.has(l.document_id)).length + stagedAdds.length;

  return (
    <div className="col-span-12 border-t pt-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          Linked Documents
          <span className="normal-case font-normal">({activeCount})</span>
        </p>
        {!pickerOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Link Documents
          </Button>
        )}
      </div>

      {/* Existing + staged rows */}
      {dependentId != null && linksLoading && <Skeleton className="h-12 w-full mb-2" />}

      {(existingLinks.length > 0 || stagedAdds.length > 0) && (
        <div className="space-y-1.5 mb-3">
          {existingLinks.map((link) => (
            <LinkedDocRow
              key={`existing-${link.link_id}`}
              title={link.title}
              documentNo={link.document_no}
              typeName={link.document_type_name}
              expiryDate={link.expiry_date}
              pendingRemoval={stagedRemoveIds.has(link.document_id)}
              onToggle={() => toggleRemoval(link.document_id)}
            />
          ))}
          {stagedAdds.map((doc) => (
            <LinkedDocRow
              key={`staged-${doc.id}`}
              title={doc.title}
              documentNo={doc.document_no}
              typeName={doc.document_type_name}
              expiryDate={doc.expiry_date}
              isNew
              onToggle={() => togglePick(doc.id)}
            />
          ))}
        </div>
      )}

      {existingLinks.length === 0 && stagedAdds.length === 0 && !pickerOpen && !linksLoading && (
        <p className="text-xs text-muted-foreground mb-2">
          No documents linked yet. Use &quot;Link Documents&quot; to select multiple documents at
          once — they are linked when you save.
        </p>
      )}

      {/* Inline multi-select picker */}
      {pickerOpen && (
        <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              Select documents to link — tick as many as you need
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setPickerOpen(false);
                setSearch("");
              }}
            >
              Done
            </Button>
          </div>
          <DmsAttachDocumentPicker
            search={search}
            onSearchChange={setSearch}
            documents={pickerDocs}
            isLoading={availableLoading}
            selectedIds={stagedAddIds}
            onToggle={togglePick}
            searchPlaceholder="Search by document number or title..."
            emptyMessage="No available documents found."
          />
        </div>
      )}

      {(stagedAdds.length > 0 || stagedRemoveIds.size > 0) && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
          {stagedAdds.length > 0 && `${stagedAdds.length} document${stagedAdds.length !== 1 ? "s" : ""} will be linked`}
          {stagedAdds.length > 0 && stagedRemoveIds.size > 0 && " · "}
          {stagedRemoveIds.size > 0 && `${stagedRemoveIds.size} will be unlinked`}
          {" when you save."}
        </p>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function LinkedDocRow({
  title,
  documentNo,
  typeName,
  expiryDate,
  isNew = false,
  pendingRemoval = false,
  onToggle,
}: {
  title: string;
  documentNo: string;
  typeName: string | null;
  expiryDate: string | null;
  isNew?: boolean;
  pendingRemoval?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
        pendingRemoval && "opacity-50 border-dashed",
        isNew && "border-green-300 bg-green-50/50 dark:bg-green-950/20"
      )}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className={cn("font-medium truncate", pendingRemoval && "line-through")}>{title}</span>
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{documentNo}</span>
      {typeName && (
        <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
          {typeName}
        </Badge>
      )}
      {expiryDate && (
        <span className="text-[10px] text-muted-foreground shrink-0">exp {expiryDate}</span>
      )}
      {isNew && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-green-700 border-green-300">
          new
        </Badge>
      )}
      {pendingRemoval && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-red-600 border-red-300">
          unlink on save
        </Badge>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
        aria-label={pendingRemoval ? "Undo unlink" : isNew ? "Remove from selection" : "Unlink document"}
      >
        {pendingRemoval ? <Undo2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </button>
    </div>
  );
}

// Re-export for parent convenience
export type { DependentDocumentLinkRow };
