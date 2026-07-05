/**
 * Report Designer — Constants
 * Phase: REPORT DESIGNER.1
 */

/** Current schema version — bump when block shape changes */
export const REPORT_DESIGNER_SCHEMA_VERSION = 2;

/** The only approved editor engine for ALGT ERP */
export const REPORT_DESIGNER_ENGINE = "puck" as const;

/** Page sizes and their A4-equivalent dimensions (mm) */
export const PAGE_SIZES = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
} as const;

/** Permitted font families (Google Fonts / system-safe) */
export const PERMITTED_FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Noto Sans",
  "Noto Sans Arabic",
  "Cairo",
  "Tajawal",
  "Open Sans",
  "Source Sans 3",
  "Arial",
  "Times New Roman",
] as const;

export type PermittedFontFamily = (typeof PERMITTED_FONT_FAMILIES)[number];

/** Block types defined in REPORT DESIGNER.1 + REPORT DESIGNER.8 + REPORT DESIGNER UX.1 */
export const REPORT_DESIGNER_BLOCK_TYPES = [
  "HeadingBlock",
  "BodyTextSectionBlock",
  "KeyValueSectionBlock",
  "DividerBlock",
  "SpacerBlock",
  "BrandingHeaderBlock",
  "CompanyLogoBlock",
  "SignatoryBlock",
  "StampBlock",
  "VerificationQrBlock",
  "ReportTableBlock",
  "ColumnStripBlock",
] as const;

export type ReportDesignerBlockType = (typeof REPORT_DESIGNER_BLOCK_TYPES)[number];

/** Governance statuses that permit visual layout edits (draft or rejected only) */
export const EDITABLE_GOVERNANCE_STATUSES = ["draft", "rejected"] as const;

/** Governance statuses that lock visual layout edits */
export const LOCKED_GOVERNANCE_STATUSES = [
  "in_review",
  "approved",
  "published",
  "archived",
] as const;

/** Max blocks per layout zone (body / header / footer) — prevents abuse */
export const MAX_BLOCKS_PER_ZONE = 50;

/** Max length of a binding path string (prevents oversized content) */
export const MAX_BINDING_PATH_LENGTH = 80;

/** Regex: only allow safe binding path characters (no scripts, no SQL) */
export const BINDING_PATH_REGEX = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** Max length of plain text props on blocks */
export const MAX_BLOCK_TEXT_LENGTH = 4000;

/** Max rows allowed in a ReportTableBlock — hard cap per security rules */
export const REPORT_TABLE_MAX_ROWS = 50;

/** Default max rows displayed in a ReportTableBlock */
export const REPORT_TABLE_DEFAULT_MAX_ROWS = 25;

/** Regex for safe column key identifiers in ReportTableBlock (no HTML, no expressions) */
export const SAFE_COLUMN_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_.]*$/ ;
