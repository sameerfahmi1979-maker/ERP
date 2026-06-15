/**
 * Global Export System Type Definitions
 * Phase 002E.2 - Export Engine Foundation
 * Phase 002E.2B - Table-State-Aware Export
 */

export type ERPExportColumn<T = any> = {
  /** Key to extract value from row object */
  key: keyof T | string;
  /** Column header text */
  header: string;
  /** Custom value getter function */
  getValue?: (row: T) => string | number | boolean | null | undefined;
  /** Column width (for PDF/Excel) */
  width?: number;
};

export type ERPExportOptions<T = any> = {
  /** Report title */
  title: string;
  /** Report subtitle/description */
  subtitle?: string;
  /** Filename (without extension) */
  filename: string;
  /** Column definitions */
  columns: ERPExportColumn<T>[];
  /** Data rows */
  data: T[];
  /** Who generated this export */
  generatedBy?: string;
  /** When was this generated */
  generatedAt?: Date;
  /** Applied filters (for display in report) */
  filters?: Record<string, string | number | boolean | null | undefined>;
  /** Page orientation */
  orientation?: "portrait" | "landscape";
  /** Export mode (for subtitle) */
  exportMode?: "selected" | "filtered" | "all";
  /** Row count */
  rowCount?: number;
};

export type ERPExportFormat = "csv" | "excel" | "pdf" | "print";

export type ERPExportResult = {
  success: boolean;
  error?: string;
  filename?: string;
};
