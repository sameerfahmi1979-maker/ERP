"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArchiveX,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { unarchiveDmsDocument } from "@/server/actions/dms/documents";
import type { ArchivedDocumentRow } from "@/server/actions/dms/documents";
import { useWorkspace } from "@/hooks/use-workspace";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";

// ── Reason badge ──────────────────────────────────────────────────────────────

function ArchiveReasonBadge({ reason }: { reason: "archived" | "renewed" }) {
  if (reason === "renewed") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-semibold px-1.5 py-0.5 border bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300"
      >
        Renewed
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] font-semibold px-1.5 py-0.5 border bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400"
    >
      Archived
    </Badge>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialDocuments: ArchivedDocumentRow[];
  categories: { id: number; name_en: string; category_code: string }[];
  documentTypes: { id: number; name_en: string; type_code: string }[];
  canUnarchive: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsArchiveTable({
  initialDocuments,
  categories,
  documentTypes,
  canUnarchive,
}: Props) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const [isPending, startTransition] = useTransition();

  // Live sync: if another user archives/unarchives, refresh the list.
  useRealtimeSync({
    table: "dms_documents",
    event: "*",
    debounceMs: 600,
    onEvent: () => { router.refresh(); },
  });

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);

  const typeOptions: ERPComboboxOption[] = useMemo(
    () => documentTypes.map((t) => ({ value: t.id, label: t.name_en })),
    [documentTypes]
  );
  const categoryOptions: ERPComboboxOption[] = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name_en })),
    [categories]
  );
  const reasonOptions: ERPComboboxOption[] = [
    { value: "archived", label: "Archived" },
    { value: "renewed", label: "Renewed" },
  ];

  // ── Client filtering ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return initialDocuments.filter((doc) => {
      if (search) {
        const s = search.toLowerCase();
        if (
          !doc.document_no.toLowerCase().includes(s) &&
          !doc.title.toLowerCase().includes(s) &&
          !(doc.description ?? "").toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      if (filterReason && doc.reason !== filterReason) return false;
      if (filterType != null && doc.document_type_id !== filterType) return false;
      if (filterCategory != null && doc.category_id !== filterCategory) return false;
      return true;
    });
  }, [initialDocuments, search, filterReason, filterType, filterCategory]);

  const tbl = useSortPaginate(filtered, {
    defaultSortKey: "updated_at",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    comparators: {
      document_type: (a, b) =>
        (a.document_type?.name_en ?? "").localeCompare(b.document_type?.name_en ?? ""),
    },
  });

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleOpen(doc: ArchivedDocumentRow) {
    openTab({
      route: `/dms/documents/record/${doc.id}`,
      title: doc.title,
      entityType: "dms_document",
      entityId: doc.id,
      tabKind: "record",
      closable: true,
    });
  }

  function handleOpenReplacement(doc: ArchivedDocumentRow) {
    if (!doc.superseded_by) return;
    openTab({
      route: `/dms/documents/record/${doc.superseded_by.id}`,
      title: doc.superseded_by.title,
      entityType: "dms_document",
      entityId: doc.superseded_by.id,
      tabKind: "record",
      closable: true,
    });
  }

  function handleUnarchive(doc: ArchivedDocumentRow) {
    startTransition(async () => {
      const result = await unarchiveDmsDocument(doc.id);
      if (result.success) {
        toast.success("Document restored to All Documents");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to restore document");
      }
    });
  }

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips = useMemo(() => {
    const c: { key: string; label: string; onRemove: () => void }[] = [];
    if (filterReason) {
      c.push({
        key: "reason",
        label: `Reason: ${filterReason === "renewed" ? "Renewed" : "Archived"}`,
        onRemove: () => setFilterReason(null),
      });
    }
    if (filterType != null) {
      const opt = typeOptions.find((o) => o.value === filterType);
      c.push({
        key: "type",
        label: `Type: ${opt?.label ?? filterType}`,
        onRemove: () => setFilterType(null),
      });
    }
    if (filterCategory != null) {
      const opt = categoryOptions.find((o) => o.value === filterCategory);
      c.push({
        key: "cat",
        label: `Category: ${opt?.label ?? filterCategory}`,
        onRemove: () => setFilterCategory(null),
      });
    }
    return c;
  }, [filterReason, filterType, filterCategory, typeOptions, categoryOptions]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by document no, title…"
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground ml-auto">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Reason
            </label>
            <ERPCombobox
              value={filterReason}
              onValueChange={(v) => setFilterReason(v == null ? null : String(v))}
              options={reasonOptions}
              placeholder="All reasons"
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <ERPCombobox
              value={filterType}
              onValueChange={(v) => setFilterType(v == null ? null : Number(v))}
              options={typeOptions}
              placeholder="All types"
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </label>
            <ERPCombobox
              value={filterCategory}
              onValueChange={(v) => setFilterCategory(v == null ? null : Number(v))}
              options={categoryOptions}
              placeholder="All categories"
              allowClear
              triggerClassName="h-8 text-xs"
            />
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            {chips.map((chip) => (
              <Badge key={chip.key} variant="secondary" className="text-xs gap-1 pr-1">
                {chip.label}
                <button
                  onClick={chip.onRemove}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <button
              onClick={() => {
                setFilterReason(null);
                setFilterType(null);
                setFilterCategory(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <SortColHeader
                field="document_no"
                sortKey={tbl.sortKey}
                sortDir={tbl.sortDir}
                onSort={tbl.toggleSort}
                className="w-[110px] px-3 py-2.5"
              >
                Doc No
              </SortColHeader>
              <SortColHeader
                field="title"
                sortKey={tbl.sortKey}
                sortDir={tbl.sortDir}
                onSort={tbl.toggleSort}
                className="px-3 py-2.5"
              >
                Title
              </SortColHeader>
              <SortColHeader
                field="document_type"
                sortKey={tbl.sortKey}
                sortDir={tbl.sortDir}
                onSort={tbl.toggleSort}
                className="w-[140px] px-3 py-2.5"
              >
                Type
              </SortColHeader>
              <th className="w-[120px] px-3 py-2.5 text-xs font-semibold text-left text-muted-foreground">
                Reason
              </th>
              <SortColHeader
                field="updated_at"
                sortKey={tbl.sortKey}
                sortDir={tbl.sortDir}
                onSort={tbl.toggleSort}
                className="w-[160px] px-3 py-2.5"
              >
                Archived / Renewed
              </SortColHeader>
              <th className="w-[80px] px-3 py-2.5 text-xs font-semibold text-right text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {filtered.length === 0 && initialDocuments.length === 0
                    ? "No archived or renewed documents yet."
                    : "No documents match the current filters."}
                </td>
              </tr>
            ) : (
              tbl.rows.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  {/* Doc No */}
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {doc.document_no}
                    </span>
                  </td>

                  {/* Title */}
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleOpen(doc)}
                      className="text-left font-medium hover:text-primary hover:underline truncate max-w-[320px] block"
                    >
                      {doc.title}
                    </button>
                    {doc.reason === "renewed" && doc.superseded_by && (
                      <button
                        onClick={() => handleOpenReplacement(doc)}
                        className="mt-0.5 flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        <ArrowUpRight className="h-3 w-3" />
                        Replaced by: {doc.superseded_by.document_no} —{" "}
                        {doc.superseded_by.title}
                      </button>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {doc.document_type?.name_en ?? "—"}
                    </span>
                  </td>

                  {/* Reason */}
                  <td className="px-3 py-2.5">
                    <ArchiveReasonBadge reason={doc.reason} />
                  </td>

                  {/* Archived / Renewed At */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {doc.archived_at
                      ? format(new Date(doc.archived_at as string), "dd MMM yyyy")
                      : doc.updated_at
                      ? format(new Date(doc.updated_at), "dd MMM yyyy")
                      : "—"}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {/* View archived doc */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpen(doc)}
                        title="View document"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>

                      {/* Restore — only for manually archived docs, not renewed */}
                      {canUnarchive && doc.reason === "archived" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleUnarchive(doc)}
                          disabled={isPending}
                          title="Restore to All Documents"
                        >
                          <ArchiveX className="h-3 w-3" />
                        </Button>
                      )}

                      {/* View replacement — for renewed docs */}
                      {doc.reason === "renewed" && doc.superseded_by && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          onClick={() => handleOpenReplacement(doc)}
                          title={`View replacement: ${doc.superseded_by.document_no}`}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={tbl.page}
        totalPages={tbl.totalPages}
        onPage={tbl.setPage}
        pageSize={tbl.pageSize}
        onPageSize={tbl.setPageSize}
        total={tbl.total}
      />
    </div>
  );
}
