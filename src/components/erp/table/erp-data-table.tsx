/**
 * ERP Data Table - Enhanced Enterprise Table Component
 * Phase 002E.2A - Global Table Rules
 * Phase 002E.2B - Table-State-Aware Export
 * 
 * Features:
 * - Sorting (click headers)
 * - Column resizing (drag borders)
 * - Column visibility (show/hide)
 * - Row selection (checkboxes)
 * - Principal-scoped, memory-only preferences
 * - Enhanced pagination
 * - Table-state-aware export (selected/filtered/sorted rows)
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnSizingState,
  type VisibilityState,
  type RowSelectionState,
  type ColumnFiltersState,
  type Table as TanStackTable,
  type Column,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { ERPTableConfig } from "./erp-table-types";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { EditFilters, type ListFilter } from "./list-controls";
import { ERPColumnMenu } from "./erp-column-menu";
import { EmbeddedListNavigation } from "./embedded-list-navigation";
import { ERPExportMenu } from "../export/erp-export-menu";
import type { ERPExportColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

// TanStack memoizes by reference. Fresh empty state arrays can repeatedly reset
// pagination after effects flush in a compact table.
const EMPTY_FILTERS: ColumnFiltersState = [];
const EMPTY_SORTING: SortingState = [];

interface ERPDataTableProps<TData> extends ERPTableConfig<TData> {
  /** Current user profile ID for preferences */
  userProfileId?: number | string;
}

/**
 * Helper: Get column header text for export
 */
function getColumnHeaderText<TData>(column: Column<TData, unknown>): string {
  // Check for export-specific header override
  if (column.columnDef.meta?.exportHeader) {
    return column.columnDef.meta.exportHeader;
  }
  
  // Use regular header if it's a string
  const header = column.columnDef.header;
  if (typeof header === "string") {
    return header;
  }
  
  // Fallback to column ID
  return column.id;
}

/**
 * Helper: Extract export data from table state
 * Priority: selected rows > filtered rows > all rows
 */
function getExportData<TData>(
  table: TanStackTable<TData>
): { data: TData[]; mode: "selected" | "filtered" | "all"; count: number } {
  const selectedRows = table.getSortedRowModel().rows.filter(row => row.getIsSelected());
  
  // Priority 1: Export selected rows if any
  if (selectedRows.length > 0) {
    return {
      data: selectedRows.map(row => row.original),
      mode: "selected",
      count: selectedRows.length,
    };
  }
  
  // Priority 2: Export filtered rows (respects search/filter)
  const filteredRows = table.getSortedRowModel().rows;
  return {
    data: filteredRows.map(row => row.original),
    mode: "filtered",
    count: filteredRows.length,
  };
}

/**
 * Helper: Extract export columns from visible columns
 */
function getExportColumns<TData>(table: TanStackTable<TData>): ERPExportColumn<TData>[] {
  return table
    .getVisibleLeafColumns()
    .filter(column => {
      // Exclude UI-only columns
      if (column.id === "select") return false;
      if (column.id === "actions") return false;
      
      // Exclude columns marked as non-exportable
      if (column.columnDef.meta?.exportable === false) return false;
      
      return true;
    })
    .map(column => ({
      key: column.id as keyof TData,
      header: getColumnHeaderText(column),
      getValue: column.columnDef.meta?.exportValue ?? (column.accessorFn ? row => column.accessorFn!(row, 0) as string | number | boolean | null | undefined : undefined),
      width: Math.max(column.getSize(), 15), // Min width 15
    }));
}

export function ERPDataTable<TData>({
  presentation = "worklist",
  tableId,
  columns,
  data,
  enableSorting = true,
  enableColumnResizing = true,
  enableRowSelection = true,
  enableColumnVisibility = true,
  enablePreferences = true,
  searchPlaceholder = "Search...",
  emptyMessage = "No records found.",
  initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  enableGlobalFilter = true,
  isLoading = false,
  toolbarSlot,
  exportConfig,  // Changed from exportSlot
  userProfileId = "default",
  serverPaged = false,
  serverRead,
  resultsLabel = "Results",
}: ERPDataTableProps<TData>) {
  const embedded = presentation === "embedded";
  // ERP GLOBAL UI.4E.1: route-scoped v2 key prevents cross-screen state leakage.
  // usePathname() is SSR-safe here since ERPDataTable is "use client".
  const currentPathname = usePathname();
  const [pathname] = useState(currentPathname);
  const key = enablePreferences && !embedded ? `table:${userProfileId}:${pathname}:${tableId}` : undefined;

  // Table state — start with server-safe empty defaults; preferences applied post-mount
  const [sorting, setSorting] = usePersistentUiState<SortingState>(key ? key+":sorting" : undefined,[]);
  const [columnSizing, setColumnSizing] = usePersistentUiState<ColumnSizingState>(key ? key+":columnSizing" : undefined,{});
  const [columnVisibility, setColumnVisibility] = usePersistentUiState<VisibilityState>(key ? key+":columnVisibility" : undefined,{});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectionData, setSelectionData] = useState(data);
  if (selectionData !== data) { setSelectionData(data); setRowSelection({}); }
  const [globalFilter, setGlobalFilter] = usePersistentUiState(key ? key+":search" : undefined,"");
  const [columnOrder, setColumnOrder] = usePersistentUiState<string[]>(key ? key+":order" : undefined, []);
  const [columnFilters, setColumnFilters] = usePersistentUiState<ColumnFiltersState>(key ? key+":filters" : undefined, []);
  const [mounted, setMounted] = useState(false);
  const remote = serverPaged || !!serverRead;
  const unavailable = !!serverRead && (serverRead.totalCount === null || !Number.isSafeInteger(serverRead.totalCount) || serverRead.totalCount < 0);
  const activeSearch = serverRead?.globalFilter ?? (embedded ? "" : globalFilter);
  const activeFilters = serverRead?.columnFilters ?? (embedded ? EMPTY_FILTERS : columnFilters);

  useEffect(()=>{setMounted(true);},[]);

  // Enhanced columns with selection column
  const enhancedColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
    const cols: ColumnDef<TData, unknown>[] = [];

    // Add selection column if enabled
    if (enableRowSelection) {
      cols.push({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="translate-y-[2px]"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-[2px]"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      });
    }

    return [...cols, ...columns.map((column, index) => ({
      ...column,
      enableHiding: index === 0 || column.id === "actions" ? false : column.enableHiding,
      filterFn: column.filterFn ?? ((row, id, value) => {
        const actual = row.getValue(id);
        if (actual == null || typeof actual === "object") return false;
        if (column.meta?.filter?.type === "date") return String(actual).slice(0, 10) === value;
        if (column.meta?.filter?.type === "select" || typeof actual === "boolean") return String(actual) === value;
        if (column.meta?.filter?.type === "number" || typeof actual === "number") return Number(actual) === Number(value);
        return String(actual).toLocaleLowerCase().includes(String(value).toLocaleLowerCase());
      }),
    } satisfies ColumnDef<TData, unknown>))];
  }, [columns, enableRowSelection]);

  const [pagination,setPagination]=usePersistentUiState(key ? key+":pagination" : undefined,{pageSize:initialPageSize,pageIndex:0});

  // Initialize table
  const table = useReactTable({
    data: unavailable ? [] : data,
    columns: enhancedColumns,
    manualFiltering: remote,
    manualPagination: remote,
    manualSorting: !!serverRead,
    rowCount: unavailable ? undefined : serverRead?.totalCount ?? undefined,
    state: {
      sorting: serverRead?.sorting ?? (embedded ? EMPTY_SORTING : sorting),
      columnSizing,
      columnVisibility: { ...columnVisibility, ...Object.fromEntries(enhancedColumns.filter(column => column.enableHiding === false).map(column => [column.id ?? ("accessorKey" in column ? String(column.accessorKey) : ""), true])) },
      rowSelection,
      globalFilter: activeSearch,
      pagination: serverRead?.pagination ?? pagination,
      columnOrder,
      columnFilters: activeFilters,
    },
    onPaginationChange:serverRead?.onPaginationChange ?? setPagination,
    onColumnOrderChange: setColumnOrder,
    onColumnFiltersChange: update => { setRowSelection({}); (serverRead?.onColumnFiltersChange ?? setColumnFilters)(update); },
    getRowId: (row, index) => row && typeof row === "object" && "id" in row ? String(row.id) : String(index),
    onSortingChange: update => { (serverRead?.onSortingChange ?? setSorting)(update); if (serverRead) serverRead.onPaginationChange(previous => ({ ...previous, pageIndex: 0 })); },
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: update => { setRowSelection({}); (serverRead?.onGlobalFilterChange ?? setGlobalFilter)(update); },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: remote ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSorting: enableSorting && !embedded,
    enableColumnResizing: enableColumnResizing && !embedded,
    columnResizeMode: "onChange",
    enableRowSelection,
    enableMultiRowSelection: true,
    initialState: {
      pagination: {
        pageSize: initialPageSize,
        pageIndex: 0,
      },
    },
  });

  const filterDefinitions: ListFilter[] = serverRead?.filters ?? (serverPaged ? [] : table.getAllLeafColumns().filter(column => column.accessorFn && column.getCanFilter()).flatMap(column => {
    const sample = table.getCoreRowModel().flatRows.map(row => row.getValue(column.id)).find(value => value != null);
    if (typeof sample === "object") return []; // A nested object needs an explicit, permitted scalar accessor.
    const type = column.columnDef.meta?.filter?.type ?? (typeof sample === "boolean" ? "select" : typeof sample === "number" ? "number" : "text");
    const label = typeof column.columnDef.header === "string" ? column.columnDef.header : column.id.replaceAll("_", " ");
    return [{ id: column.id, label, type, options: column.columnDef.meta?.filter?.options ?? (typeof sample === "boolean" ? [{ value:"true", label:column.id === "is_active" ? "Active" : "Yes" }, { value:"false", label:column.id === "is_active" ? "Inactive" : "No" }] : undefined) }];
  }));
  const filteredCount = table.getFilteredRowModel().rows.length;
  useEffect(() => {
    if (!remote) setPagination(previous => {
      const pageIndex = Math.min(previous.pageIndex, Math.max(0, Math.ceil(filteredCount / previous.pageSize) - 1));
      return pageIndex === previous.pageIndex ? previous : { ...previous, pageIndex };
    });
  }, [filteredCount, remote, setPagination]);
  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

  // Prepare export data and columns from table state
  // CRITICAL: Must depend on rowSelection, columnVisibility, globalFilter, sorting
  // so that export updates when user selects rows or changes table state
  const exportData = exportConfig ? getExportData(table) : null;
  const exportColumns = exportConfig ? getExportColumns(table) : [];

  // Build dynamic subtitle for export
  const exportSubtitle = useMemo(() => {
    if (!exportConfig || !exportData) return exportConfig?.subtitle;
    
    const baseSubtitle = exportConfig.subtitle || "";
    const modeText = 
      exportData.mode === "selected" ? `${exportData.count} selected record${exportData.count > 1 ? "s" : ""}` :
      exportData.mode === "filtered" ? `${exportData.count} filtered record${exportData.count > 1 ? "s" : ""}` :
      `all ${exportData.count} record${exportData.count > 1 ? "s" : ""}`;
    
    const scope = serverRead && exportData.mode !== "selected"
      ? unavailable ? "Matching total is not yet available"
        : serverRead.loadExportData ? `all ${serverRead.totalCount} matching authorized records`
          : "Complete export is unavailable"
      : remote ? `${modeText} from the current loaded page only` : modeText;
    return baseSubtitle ? `${baseSubtitle} (${scope})` : scope;
  }, [exportConfig, exportData, remote, serverRead, unavailable]);

  return (
    <div className="algt-data-table min-w-0 flex flex-col" data-list-presentation={presentation} aria-busy={isLoading || undefined}>
      {isLoading && <p role="status" className="p-3 text-sm text-muted-foreground">Loading records…</p>}
      {/* Toolbar */}
      {!embedded && <div className="flex flex-col gap-3 p-4 border-b border-border/40">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {enableGlobalFilter && (!serverPaged || !!serverRead) && (
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={activeSearch}
                onChange={(e) => { table.setGlobalFilter(e.target.value); table.setPageIndex(0); }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          
          <div className="flex flex-wrap items-center gap-2">
            {toolbarSlot}
            {enableColumnVisibility && <ERPColumnMenu table={table} />}
            {exportConfig && exportData && (
              <ERPExportMenu
                title={exportConfig.title}
                filename={exportConfig.filename}
                data={exportData.data}
                loadData={serverRead && exportData.mode !== "selected" ? serverRead.loadExportData : undefined}
                columns={exportColumns}
                subtitle={exportSubtitle}
                generatedBy={exportConfig.generatedBy}
                orientation={exportConfig.orientation}
                disabled={exportData.count === 0 || (!!serverRead && (unavailable || isLoading || (exportData.mode !== "selected" && !serverRead.loadExportData)))}
              />
            )}
          </div>
        </div>

        {/* Selection count */}
        {enableRowSelection && selectedRowCount > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {selectedRowCount} row{selectedRowCount > 1 ? "s" : ""} selected
            </span>
            <button type="button"
              onClick={() => table.resetRowSelection()}
              className="text-xs text-primary hover:underline"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>}

      {!embedded && filterDefinitions.length > 0 && <div className="flex flex-wrap gap-2 p-4">
        <EditFilters definitions={filterDefinitions} values={Object.fromEntries(activeFilters.map(filter => [filter.id, String(filter.value)]))}
          scopeLabel={serverRead ? "Filters query the complete permitted result before paging. Text contains; numbers, dates and choices match exactly." : "Filters match the permitted rows loaded into this list. Text contains; numbers, dates and choices match exactly."} onApply={values => { table.setColumnFilters(Object.entries(values).filter(([,value])=>value).map(([id,value])=>({id,value}))); table.setPageIndex(0); }} />
        {(activeSearch || activeFilters.length > 0) && <button type="button" className="text-sm text-primary underline" onClick={() => { table.setGlobalFilter(""); table.setColumnFilters([]); table.setPageIndex(0); }}>Clear search and filters</button>}
      </div>}
      {/* Table */}
      <div role="region" aria-label={`${resultsLabel} — scrollable table`} tabIndex={0} className="overflow-x-auto">
        <Table style={{ tableLayout: embedded ? "auto" : "fixed", minWidth: "100%" }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-border/40">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width: embedded ? undefined : header.getSize(),
                      position: "relative",
                    }}
                    className={cn(
                      "h-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 select-none overflow-hidden",
                      embedded && "whitespace-normal break-words [overflow-wrap:anywhere]",
                      header.column.getCanSort() && "cursor-pointer hover:bg-muted/50"
                    )}
                    aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none"}
                  >
                    <div className="flex items-center gap-2">
                      {header.isPlaceholder ? null : header.column.getCanSort()
                        ? <button type="button" className="min-h-8 text-left focus-visible:outline-2" onClick={header.column.getToggleSortingHandler()}>{typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : header.column.id.replaceAll("_", " ")}</button>
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      
                      {/* Sort indicator */}
                      {header.column.getCanSort() && mounted && (
                        <span className="ml-auto">
                          {header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Resize handle */}
                    {!embedded && enableColumnResizing && header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                          "hover:bg-primary/50",
                          header.column.getIsResizing() && "bg-primary"
                        )}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  {...(row.getIsSelected() && { "data-state": "selected" })}
                  className={cn(
                    "border-border/40 hover:bg-muted/30 transition-colors",
                    row.getIsSelected() && "bg-primary/5"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: embedded ? undefined : cell.column.getSize() }}
                      className={cn("h-12 text-sm", embedded ? "whitespace-normal break-words [overflow-wrap:anywhere]" : "overflow-hidden")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={enhancedColumns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {unavailable ? "Records could not yet be verified. Check the read status or retry." : isLoading ? "Loading records…" : activeSearch || activeFilters.length > 0 ? "No records match your search and filters. Clear them to see the available records." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {embedded && (!serverPaged || !!serverRead) && <EmbeddedListNavigation label={resultsLabel} total={unavailable ? null : serverRead?.totalCount ?? filteredCount}
        pagination={table.getState().pagination} busy={isLoading} onPaginationChange={serverRead?.onPaginationChange ?? setPagination}
        hasCriteria={!!activeSearch || activeFilters.length > 0} onClearCriteria={() => { table.setGlobalFilter(""); table.setColumnFilters([]); table.setPageIndex(0); }} />}
      {!embedded && (!serverPaged || !!serverRead) && <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 flex-wrap gap-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {unavailable ? "Matching total is not yet available" : `Showing ${table.getRowModel().rows.length} of ${serverRead?.totalCount ?? filteredCount} matching records (${unavailable ? 0 : data.length} loaded)`}
          </span>
          {selectedRowCount > 0 && (
            <span className="text-primary font-medium">
              {selectedRowCount} selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page:</span>
            <select
              aria-label="Rows per page"
              value={table.getState().pagination.pageSize}
              disabled={!!serverRead && (unavailable || isLoading)}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage() || (!!serverRead && (unavailable || isLoading))}
              className="h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="mx-2 text-xs text-muted-foreground">
              {unavailable ? "Page total unavailable" : `Page ${table.getState().pagination.pageIndex + 1} of ${Math.max(1, table.getPageCount())}`}
            </span>
            <button type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || (!!serverRead && (unavailable || isLoading))}
              className="h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}
