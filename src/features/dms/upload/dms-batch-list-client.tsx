"use client";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Layers, ArrowRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { TableSearchInput } from "@/components/erp/table/table-search-input";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import type { DmsUploadBatchListRow } from "@/server/actions/dms/batch-intake";

interface Props {
  initialBatches: DmsUploadBatchListRow[];
}

const BATCH_STATUS_STYLES: Record<string, string> = {
  processing: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  ready_for_review: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  partially_approved: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
  completed: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const DMS_LIST_FIELDS: DmsListField[] = [
  {
    "id": "batch_code",
    "label": "Batch",
    "path": "batch_code",
    "type": "text",
    "width": 160,
    "required": true
  },
  {
    "id": "status",
    "label": "Status",
    "path": "status",
    "type": "text",
    "width": 160
  },
  {
    "id": "total_files",
    "label": "Files",
    "path": "total_files",
    "type": "number",
    "width": 100
  },
  {
    "id": "pendingCount",
    "label": "Pending",
    "path": "pendingCount",
    "type": "number",
    "width": 110
  },
  {
    "id": "approvedCount",
    "label": "Approved",
    "path": "approvedCount",
    "type": "number",
    "width": 110
  },
  {
    "id": "discardedCount",
    "label": "Discarded",
    "path": "discardedCount",
    "type": "number",
    "width": 110
  },
  {
    "id": "created_at",
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

export function DmsBatchListClient({ initialBatches }: Props) {
  const router = useRouter();
  const batches = initialBatches;
  const [isPending, startTransition] = useTransition();

  const listView = useDmsListView("upload-batches", batches, DMS_LIST_FIELDS);
  const table = useSortPaginate(listView.rows, {
    memoryKey: "dms:upload-batches",
    defaultSortKey: "created_at",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    getSearchText: (b) => [b.batch_code, b.status].join(" "),
    comparators: {
      total_files: (a, b) => a.total_files - b.total_files,
      pendingCount: (a, b) => a.pendingCount - b.pendingCount,
      approvedCount: (a, b) => a.approvedCount - b.approvedCount,
      discardedCount: (a, b) => a.discardedCount - b.discardedCount,
    },
  });

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const open = useCallback(
    (batchCode: string) => router.push(`/dms/inbox/batch/${batchCode}`),
    [router]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {table.total !== batches.length
            ? `${table.total} of ${batches.length} batches`
            : `${batches.length} ${batches.length === 1 ? "batch" : "batches"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearchInput value={table.query} onChange={table.setQuery} placeholder="Search batches…" className="w-48" />
          <Button size="sm" variant="outline" onClick={refresh} disabled={isPending}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isPending && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <DmsListTools view={listView} />
<div className="rounded-xl border bg-card overflow-hidden">
        <div role="region" aria-label="upload-batches table" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth: listView.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listView.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <ConfiguredRow columns={listView.columns}>
              <SortColHeader data-column="batch_code" field="batch_code" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Batch</SortColHeader>
              <SortColHeader data-column="status" field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Status</SortColHeader>
              <SortColHeader data-column="total_files" field="total_files" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="right" className="px-3 py-2">Files</SortColHeader>
              <SortColHeader data-column="pendingCount" field="pendingCount" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="right" className="px-3 py-2">Pending</SortColHeader>
              <SortColHeader data-column="approvedCount" field="approvedCount" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="right" className="px-3 py-2">Approved</SortColHeader>
              <SortColHeader data-column="discardedCount" field="discardedCount" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="right" className="px-3 py-2">Discarded</SortColHeader>
              <SortColHeader data-column="created_at" field="created_at" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Created</SortColHeader>
              <th data-column="actions" className="text-right font-medium px-3 py-2">Actions</th>
            </ConfiguredRow>
          </thead>
          <tbody>
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={listView.visible.length} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  {table.query ? "No batches match your search." : "No upload batches yet. Use the Upload Inbox in \"Multiple Files (Batch)\" mode to create one."}
                </td>
              </tr>
            )}
            {table.rows.map((b) => (
              <ConfiguredRow columns={listView.columns}
                key={b.id}
                className="border-t hover:bg-muted/20 cursor-pointer"
                onClick={() => open(b.batch_code)}
              >
                <td data-column="batch_code" className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-violet-600 shrink-0 dark:text-violet-300" />
                    <span className="font-mono text-xs font-semibold">{b.batch_code}</span>
                  </div>
                </td>
                <td data-column="status" className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] border",
                      BATCH_STATUS_STYLES[b.status] ?? "bg-muted text-foreground border-border"
                    )}
                  >
                    {b.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td data-column="total_files" className="px-3 py-2 text-right tabular-nums">{b.total_files}</td>
                <td data-column="pendingCount" className="px-3 py-2 text-right tabular-nums">
                  {b.pendingCount > 0 ? (
                    <span className="font-semibold text-amber-600 dark:text-amber-300">{b.pendingCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td data-column="approvedCount" className="px-3 py-2 text-right tabular-nums text-green-600 dark:text-green-300">{b.approvedCount}</td>
                <td data-column="discardedCount" className="px-3 py-2 text-right tabular-nums text-muted-foreground">{b.discardedCount}</td>
                <td data-column="created_at" className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(b.created_at)}</td>
                <td data-column="actions" className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(b.batch_code);
                    }}
                  >
                    {b.pendingCount > 0 ? "Review" : "Open"}
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </td>
              </ConfiguredRow>
            ))}
          </tbody>
        </table></div>
        <TablePagination
          page={table.page}
          totalPages={table.totalPages}
          onPage={table.setPage}
          pageSize={table.pageSize}
          onPageSize={table.setPageSize}
          total={table.total}
        />
      </div>
    </div>
  );
}
