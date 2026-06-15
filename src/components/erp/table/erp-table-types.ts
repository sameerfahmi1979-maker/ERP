/**
 * ERP Table System - Type Definitions
 * Phase 002E.2A - Global Table Rules
 * Phase 002E.2B - Table-State-Aware Export
 */

import type { ColumnDef, SortingState, ColumnSizingState, VisibilityState, RowSelectionState } from "@tanstack/react-table";

/**
 * TanStack Table Column Metadata Extension
 * Adds export control and formatting options
 */
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    /** Whether this column should be exported (default: true) */
    exportable?: boolean;
    /** Override column header text for export */
    exportHeader?: string;
    /** Custom value formatter for export */
    exportValue?: (row: TData) => string | number | boolean | null | undefined;
  }
}

/**
 * Table density modes
 */
export type ERPTableDensity = "comfortable" | "compact" | "dense";

/**
 * Export configuration for ERPDataTable
 */
export interface ERPTableExportConfig {
  /** Report title */
  title: string;
  /** Report subtitle/description */
  subtitle?: string;
  /** Filename base (without extension) */
  filename: string;
  /** Who generated this export */
  generatedBy?: string;
  /** Page orientation */
  orientation?: "portrait" | "landscape";
}

/**
 * Table preferences stored in localStorage.
 *
 * ERP GLOBAL UI.4E: extended with globalFilter and pageIndex so that
 * switching workspace tabs and returning preserves search text and page.
 */
export interface ERPTablePreferences {
  /** Column widths */
  columnSizing?: ColumnSizingState;
  /** Column visibility */
  columnVisibility?: VisibilityState;
  /** Sorting state */
  sorting?: SortingState;
  /** Page size */
  pageSize?: number;
  /** Table density */
  density?: ERPTableDensity;
  /**
   * Active global search text (UI.4E — workspace session cache).
   * Restored on tab return/remount; cleared by user typing a new query.
   */
  globalFilter?: string;
  /**
   * Active pagination page index (UI.4E — workspace session cache).
   * Allows users to return to the same page they were on.
   */
  pageIndex?: number;
  /** Last updated timestamp */
  updatedAt?: string;
}

/**
 * Table configuration
 */
export interface ERPTableConfig<TData> {
  /** Unique table ID for preferences */
  tableId: string;
  /** Column definitions */
  columns: ColumnDef<TData, any>[];
  /** Table data */
  data: TData[];
  /** Enable sorting */
  enableSorting?: boolean;
  /** Enable column resizing */
  enableColumnResizing?: boolean;
  /** Enable row selection */
  enableRowSelection?: boolean;
  /** Enable column visibility */
  enableColumnVisibility?: boolean;
  /** Enable preferences persistence */
  enablePreferences?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Empty message */
  emptyMessage?: string;
  /** Initial page size */
  initialPageSize?: number;
  /** Page size options */
  pageSizeOptions?: number[];
  /** Enable global filter */
  enableGlobalFilter?: boolean;
  /** Toolbar slot */
  toolbarSlot?: React.ReactNode;
  /** Export configuration (replaces exportSlot) */
  exportConfig?: ERPTableExportConfig;
}

/**
 * Table toolbar props
 */
export interface ERPTableToolbarProps {
  /** Table instance */
  table: any;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Enable global filter */
  enableGlobalFilter?: boolean;
  /** Toolbar slot */
  toolbarSlot?: React.ReactNode;
  /** Export menu slot */
  exportSlot?: React.ReactNode;
  /** Column menu slot */
  columnMenuSlot?: React.ReactNode;
}

/**
 * Column visibility menu props */
export interface ERPColumnMenuProps {
  /** Table instance */
  table: any;
  /** Required column IDs that cannot be hidden */
  requiredColumns?: string[];
}

/**
 * Pagination props
 */
export interface ERPTablePaginationProps {
  /** Table instance */
  table: any;
  /** Page size options */
  pageSizeOptions?: number[];
  /** Show total rows */
  showTotal?: boolean;
}
