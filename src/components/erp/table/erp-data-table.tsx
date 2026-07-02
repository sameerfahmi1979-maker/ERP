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
 * - Persistent preferences (localStorage)
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
import { loadTablePreferences, saveTablePreferences } from "./erp-table-preferences";
import { ERPColumnMenu } from "./erp-column-menu";
import { ERPExportMenu } from "../export/erp-export-menu";
import type { ERPExportColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

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
  const selectedRows = table.getSelectedRowModel().rows;
  
  // Priority 1: Export selected rows if any
  if (selectedRows.length > 0) {
    return {
      data: selectedRows.map(row => row.original),
      mode: "selected",
      count: selectedRows.length,
    };
  }
  
  // Priority 2: Export filtered rows (respects search/filter)
  const filteredRows = table.getFilteredRowModel().rows;
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
      getValue: column.columnDef.meta?.exportValue,
      width: Math.max(column.getSize(), 15), // Min width 15
    }));
}

export function ERPDataTable<TData>({
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
  toolbarSlot,
  exportConfig,  // Changed from exportSlot
  userProfileId = "default",
}: ERPDataTableProps<TData>) {
  // ERP GLOBAL UI.4E.1: route-scoped v2 key prevents cross-screen state leakage.
  // usePathname() is SSR-safe here since ERPDataTable is "use client".
  const pathname = usePathname();

  // Load preferences (client-side only)
  const savedPrefs = useMemo(() => {
    if (!enablePreferences || typeof window === "undefined") return null;
    return loadTablePreferences(userProfileId, tableId, pathname);
  }, [enablePreferences, userProfileId, tableId, pathname]);

  // Table state — globalFilter and pageIndex are restored from savedPrefs (UI.4E)
  const [sorting, setSorting] = useState<SortingState>(savedPrefs?.sorting || []);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(savedPrefs?.columnSizing || {});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(savedPrefs?.columnVisibility || {});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState(savedPrefs?.globalFilter ?? "");
  const [mounted, setMounted] = useState(false);

  // Set mounted flag after client hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Enhanced columns with selection column
  const enhancedColumns = useMemo<ColumnDef<TData, any>[]>(() => {
    const cols: ColumnDef<TData, any>[] = [];

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

    return [...cols, ...columns];
  }, [columns, enableRowSelection]);

  // Initialize table
  const table = useReactTable({
    data,
    columns: enhancedColumns,
    state: {
      sorting,
      columnSizing,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSorting,
    enableColumnResizing,
    columnResizeMode: "onChange",
    enableRowSelection,
    enableMultiRowSelection: true,
    initialState: {
      pagination: {
        pageSize: savedPrefs?.pageSize || initialPageSize,
        // Restore page index from saved prefs (UI.4E workspace session cache)
        pageIndex: savedPrefs?.pageIndex ?? 0,
      },
    },
  });

  // Save preferences when state changes (client-side only).
  // UI.4E: also saves globalFilter and pageIndex for workspace session restore.
  useEffect(() => {
    if (!enablePreferences || typeof window === "undefined") return;

    const { pageSize, pageIndex } = table.getState().pagination;
    const timer = setTimeout(() => {
      saveTablePreferences(userProfileId, tableId, {
        sorting,
        columnSizing,
        columnVisibility,
        pageSize,
        pageIndex,
        globalFilter: globalFilter || undefined,
      }, pathname);
    }, 500); // Debounce saves

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting, columnSizing, columnVisibility, globalFilter,
      table.getState().pagination.pageSize,
      table.getState().pagination.pageIndex,
      enablePreferences, userProfileId, tableId]);

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

  // Prepare export data and columns from table state
  // CRITICAL: Must depend on rowSelection, columnVisibility, globalFilter, sorting
  // so that export updates when user selects rows or changes table state
  const exportData = useMemo(() => 
    exportConfig ? getExportData(table) : null, 
    [table, exportConfig, rowSelection, columnVisibility, globalFilter, sorting]
  );
  const exportColumns = useMemo(() => 
    exportConfig ? getExportColumns(table) : [], 
    [table, exportConfig, columnVisibility]
  );

  // Build dynamic subtitle for export
  const exportSubtitle = useMemo(() => {
    if (!exportConfig || !exportData) return exportConfig?.subtitle;
    
    const baseSubtitle = exportConfig.subtitle || "";
    const modeText = 
      exportData.mode === "selected" ? `${exportData.count} selected record${exportData.count > 1 ? "s" : ""}` :
      exportData.mode === "filtered" ? `${exportData.count} filtered record${exportData.count > 1 ? "s" : ""}` :
      `all ${exportData.count} record${exportData.count > 1 ? "s" : ""}`;
    
    return baseSubtitle ? `${baseSubtitle} (${modeText})` : modeText;
  }, [exportConfig, exportData]);

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b border-border/40">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {enableGlobalFilter && (
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          
          <div className="flex items-center gap-2">
            {toolbarSlot}
            {enableColumnVisibility && <ERPColumnMenu table={table} />}
            {exportConfig && exportData && (
              <ERPExportMenu
                title={exportConfig.title}
                filename={exportConfig.filename}
                data={exportData.data}
                columns={exportColumns}
                subtitle={exportSubtitle}
                generatedBy={exportConfig.generatedBy}
                orientation={exportConfig.orientation}
                disabled={exportData.count === 0}
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
            <button
              onClick={() => table.resetRowSelection()}
              className="text-xs text-primary hover:underline"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table style={{ tableLayout: "fixed", minWidth: "100%" }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-border/40">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      position: "relative",
                    }}
                    className={cn(
                      "h-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 select-none overflow-hidden",
                      header.column.getCanSort() && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {header.isPlaceholder
                        ? null
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
                    {enableColumnResizing && header.column.getCanResize() && (
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
                      style={{ width: cell.column.getSize() }}
                      className="h-12 text-sm overflow-hidden"
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
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 flex-wrap gap-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Showing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s)
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
              value={table.getState().pagination.pageSize}
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
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="mx-2 text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
