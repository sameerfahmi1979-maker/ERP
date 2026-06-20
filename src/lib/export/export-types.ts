/**
 * Global Export System Type Definitions
 * Phase 002E.2  - Export Engine Foundation
 * Phase 002E.2B - Table-State-Aware Export
 * Phase REPORT.3 - Template / Branding / Output Adapter Engine
 */

/**
 * Serializable, client-safe branding context for export adapters.
 * Extracted from ResolvedReportTemplate/ReportBrandingProfile on the server
 * and passed as a plain JSON-serializable object to client-side export functions.
 * Never include server-only types here.
 */
export interface ExportBrandingContext {
  /** Company legal name (EN) */
  companyNameEn?: string | null;
  /** Company legal name (AR) */
  companyNameAr?: string | null;
  /** Logo image URL (must be publicly accessible for PDF/print rendering) */
  logoUrl?: string | null;
  /** Formatted address block (EN) */
  addressBlockEn?: string | null;
  /** Contact phone */
  phone?: string | null;
  /** Contact email */
  email?: string | null;
  /** Website */
  website?: string | null;
  /** Tax registration number */
  trn?: string | null;
  /** Trade license number */
  tradeLicenseNo?: string | null;
  /** Footer disclaimer text (EN) */
  footerTextEn?: string | null;
  /** Signatory name */
  signatoryName?: string | null;
  /** Signatory title (EN) */
  signatoryTitleEn?: string | null;
  /** Theme primary color (hex, e.g. "#1e293b") */
  themePrimaryColor?: string | null;
  /** Theme header background color (hex) */
  themeHeaderBgColor?: string | null;
  /** Theme header text color (hex) */
  themeHeaderTextColor?: string | null;
  /** Whether to show logo in output */
  showLogo?: boolean;
  /** Whether to show company address */
  showAddress?: boolean;
  /** Whether to show TRN */
  showTrn?: boolean;
  /** Whether to show trade license number */
  showLicense?: boolean;
  /** Whether to show signatory block */
  showSignatory?: boolean;
  /** Whether to show watermark text */
  showWatermark?: boolean;
  /** Watermark text override (if not using default) */
  watermarkText?: string | null;
  /** Report code from registry */
  reportCode?: string | null;
  /** Template name for metadata display */
  templateName?: string | null;
  /** Whether this is a group/multi-company profile */
  isGroupProfile?: boolean;
  /** Whether this is a neutral/no-company profile */
  isNeutralProfile?: boolean;
  /** Page orientation from template */
  templateOrientation?: "portrait" | "landscape";
}

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
  /**
   * Optional branding context (REPORT.3).
   * When present, PDF/print/Excel output will use company branding
   * instead of the neutral fallback. Existing callers without this
   * field continue to work exactly as before.
   */
  branding?: ExportBrandingContext;
};

export type ERPExportFormat = "csv" | "excel" | "pdf" | "print";

export type ERPExportResult = {
  success: boolean;
  error?: string;
  filename?: string;
};
