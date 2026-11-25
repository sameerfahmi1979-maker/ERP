"use client";

import { Badge } from "@/components/ui/badge";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { FileText } from "lucide-react";
import { FIRST_REPORT_SCREEN_PAGE, type ReportDataResult, type ReportScreenPage, type ReportScreenPageQuery } from "@/lib/report-center/types";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ERPTableServerRead } from "@/components/erp/table/erp-table-types";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import { useLayoutEffect, useMemo, useState } from "react";

type PageResult = {data: ReportDataResult; page: ReportScreenPage};
type LoadPage = (query: ReportScreenPageQuery, isCurrent: () => boolean) => Promise<PageResult | null>;

interface ReportResultsTableProps {
  data: ReportDataResult | null;
  isLoading: boolean;
  error?: string | null;
  initialColumns?: string[];
  initialPage?: ReportScreenPage;
  loadPage?: LoadPage;
  preferenceKey?: string;
}

// Human-readable column headers
function formatColumnHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format cell value for display
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function statusVariant(value: string): "default" | "destructive" | "outline" | "secondary" {
  const v = value.toLowerCase();
  if (["active", "valid", "ready", "approved", "completed", "hired", "issued"].includes(v)) return "default";
  if (["expired", "inactive", "rejected", "failed", "blocked"].includes(v)) return "destructive";
  if (["expiring", "pending", "on_hold", "incomplete"].includes(v)) return "secondary";
  return "outline";
}

const STATUS_COLUMNS = new Set(["status", "approval_status", "readiness_status", "assignment_status", "candidate_status", "case_status", "ppe_status", "asset_status", "offer_status", "task_status", "process_status", "wps_status"]);

export function ReportResultsTable({ data, isLoading, error, initialColumns, initialPage, loadPage, preferenceKey }: ReportResultsTableProps) {
  if (isLoading) {
    return (
      <div role="status" className="border rounded-sm bg-card p-8 text-center text-sm text-muted-foreground">
        Loading report data...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="border rounded-sm bg-destructive/5 border-destructive/20 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;
  if (initialPage && loadPage && initialPage.totalCount > 0) {
    return <PagedResultWorklist data={data} initialColumns={initialColumns ?? data.columns}
      initialPage={initialPage} loadPage={loadPage} preferenceKey={preferenceKey} />;
  }
  if (data.rows.length === 0) {
    return (
      <ERPEmptyState
        icon={FileText}
        title="No results found"
        description="Try adjusting your filters and running the report again."
      />
    );
  }

  return <ResultWorklist data={data} />;
}

interface WorklistControls {
  pagination: PaginationState;
  sorting: SortingState;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
}

function PagedResultWorklist({data, initialColumns, initialPage, loadPage, preferenceKey}: {
  data: ReportDataResult;
  initialColumns: string[];
  initialPage: ReportScreenPage;
  loadPage: LoadPage;
  preferenceKey?: string;
}) {
  const {columns} = data;
  const [controls, setControls] = usePersistentUiState<WorklistControls>(
    preferenceKey ? `${preferenceKey}:${JSON.stringify(columns)}` : undefined,
    {pagination: {pageIndex: 0, pageSize: initialPage.pageSize}, sorting: [], globalFilter: "", columnFilters: []},
  );
  const query = useMemo(() => ({
    ...controls.pagination,
    sorting: controls.sorting,
    globalFilter: controls.globalFilter,
    columnFilters: controls.columnFilters.map(({id, value}) => ({id, value: String(value ?? "")})),
    columns,
  }), [columns, controls]);
  const key = JSON.stringify(query);
  const initialKey = JSON.stringify({...FIRST_REPORT_SCREEN_PAGE, columns: initialColumns});
  const [tracking, setTracking] = useState({key, generation: 0});
  const generation = tracking.key === key ? tracking.generation : tracking.generation + 1;
  if (tracking.key !== key) setTracking({key, generation});
  const [loaded, setLoaded] = useState<{generation: number; result: PageResult}>();
  const useInitial = generation === 0 && key === initialKey;
  const current = useInitial ? {data, page: initialPage} : loaded?.generation === generation ? loaded.result : null;

  useLayoutEffect(() => {
    if (useInitial) return;
    let active = true;
    const timeout = setTimeout(() => {
      void loadPage(query, () => active).then(result => {
        if (active && result) setLoaded({generation, result});
      });
    }, 200);
    return () => { active = false; clearTimeout(timeout); };
  }, [useInitial, generation, loadPage, query]);

  const update = <K extends keyof WorklistControls>(field: K, updater: Updater<WorklistControls[K]>) => {
    setControls(previous => {
      const value = typeof updater === "function" ? updater(previous[field]) : updater;
      return Object.is(previous[field], value) ? previous : {...previous, [field]: value};
    });
  };
  const page = current?.page;
  const serverRead: ERPTableServerRead<Record<string, unknown>> = {
    ...controls,
    pagination: page ? {pageIndex: page.pageIndex, pageSize: page.pageSize} : controls.pagination,
    totalCount: page?.totalCount ?? null,
    filters: initialPage.filters.filter(filter => columns.includes(filter.id)).map(filter => ({...filter, label: formatColumnHeader(filter.id)})),
    onPaginationChange: updater => update("pagination", previous => {
      const currentPagination = page ? {pageIndex: page.pageIndex, pageSize: page.pageSize} : previous;
      const next = typeof updater === "function" ? updater(currentPagination) : updater;
      return previous.pageIndex === next.pageIndex && previous.pageSize === next.pageSize ? previous : next;
    }),
    onSortingChange: updater => update("sorting", updater),
    onGlobalFilterChange: updater => update("globalFilter", updater),
    onColumnFiltersChange: updater => update("columnFilters", updater),
  };

  return <ResultWorklist data={{...data, rows: current?.data.rows ?? []}} serverRead={serverRead}
    sortDescFirst={page?.sortDescFirst ?? initialPage.sortDescFirst} isLoading={!current} />;
}

function ResultWorklist({data, serverRead, sortDescFirst, isLoading}: {
  data: ReportDataResult;
  serverRead?: ERPTableServerRead<Record<string, unknown>>;
  sortDescFirst?: string[];
  isLoading?: boolean;
}) {
  const { columns, rows } = data;
  const tableColumns: ColumnDef<Record<string, unknown>>[] = columns.map(col => ({
    id: col, accessorFn: row => row[col], header: formatColumnHeader(col), size: 180,
    sortDescFirst: sortDescFirst?.includes(col),
    cell: ({ getValue }) => {
      const value = getValue();
      return STATUS_COLUMNS.has(col) && value ? <Badge variant={statusVariant(String(value))} className="text-xs capitalize">{String(value).replace(/_/g," ")}</Badge>
        : <span className="whitespace-normal break-words">{formatCellValue(value)}</span>;
    },
  }));

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <ERPDataTable presentation="worklist" key={columns.join("|")} tableId={`reports.results:${columns.join("|")}`} columnPreferenceId={null} columns={tableColumns} data={rows}
        enableRowSelection={false} searchPlaceholder="Search generated rows…" initialPageSize={25} serverRead={serverRead} isLoading={isLoading} />
      <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        {serverRead ? "List filters apply to the complete report preview. Exports use the report filters above."
          : <>{rows.length.toLocaleString()} loaded row{rows.length !== 1 ? "s" : ""}. List filters affect these generated rows only, not the report definition or its exports.
            {data.meta?.total && Number(data.meta.total) !== rows.length ? ` (${Number(data.meta.total).toLocaleString()} total)` : null}</>}
      </div>
    </div>
  );
}
