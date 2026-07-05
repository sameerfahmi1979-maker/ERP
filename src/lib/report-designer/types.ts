/**
 * Report Designer — Core Types
 * Phase: REPORT DESIGNER.1 — DB Schema, Layout Standard, Zod Validation
 *
 * These types define the canonical visual layout JSON format stored in
 * erp_report_templates.body_layout_json (and header_/footer_layout_json).
 *
 * Security rules:
 *  - All text props are plain strings — never raw HTML
 *  - All data bindings are validated against ERP_BINDING_REGISTRY
 *  - No script, eval, innerHTML, event handlers, or external URLs in props
 *  - Official rendering always goes through the Executive Ledger engine
 */

// ─────────────────────────────────────────────────────────────────────────────
// Engine + schema versioning
// ─────────────────────────────────────────────────────────────────────────────

/** The only approved visual editor engine for ALGT ERP */
export type ReportDesignerEngine = "puck";

/** Current layout JSON schema version — increment when block schema changes */
export const CURRENT_LAYOUT_SCHEMA_VERSION = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Layout root
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level visual layout JSON stored in erp_report_templates.body_layout_json.
 * Also used for header_layout_json and footer_layout_json with the same shape.
 */
export interface ReportDesignerLayoutJson {
  /** Incremented when block schema format changes — used for migration guards */
  schemaVersion: number;
  /** Editor engine that produced this layout */
  engine: ReportDesignerEngine;
  /** Ordered array of ERP blocks constituting the document zone */
  content: ReportDesignerBlock[];
  /** Root-level document configuration */
  root: ReportDesignerLayoutRoot;
}

export interface ReportDesignerLayoutRoot {
  props: {
    orientation?: "portrait" | "landscape";
    pageSize?: "A4" | "A3" | "Letter";
    fontFamily?: string;
    languageMode?: "en" | "ar" | "bilingual";
  };
}

/** An empty / unset layout — the default value when no layout has been designed */
export const EMPTY_LAYOUT: ReportDesignerLayoutJson = {
  schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
  engine: "puck",
  content: [],
  root: { props: {} },
};

// ─────────────────────────────────────────────────────────────────────────────
// Block type discriminated union
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All permitted ERP block types for REPORT DESIGNER.1.
 * New block types are added here in future phases and MUST be added to:
 *  1. This union
 *  2. The Zod schema in layout-schema.ts
 *  3. The Puck component config in REPORT DESIGNER.3
 */
export type ReportDesignerBlock =
  | HeadingBlock
  | BodyTextSectionBlock
  | KeyValueSectionBlock
  | DividerBlock
  | SpacerBlock
  | BrandingHeaderBlock
  | CompanyLogoBlock
  | SignatoryBlock
  | StampBlock
  | VerificationQrBlock
  | ReportTableBlock
  | ColumnStripBlock;

/** Discriminated block type literal union */
export type ReportDesignerBlockType = ReportDesignerBlock["type"];

// ─────────────────────────────────────────────────────────────────────────────
// Heading block
// ─────────────────────────────────────────────────────────────────────────────

/** H1/H2 heading. Static text only — no bindings. */
export interface HeadingBlock {
  type: "HeadingBlock";
  props: {
    /** Heading text — plain string, XSS-escaped at render time */
    text: string;
    level: "h1" | "h2" | "h3";
    align?: "left" | "center" | "right";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ProseMirror JSON (TipTap rich text) — REPORT DESIGNER UX.1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal type for ProseMirror/TipTap JSON document.
 * Stored as-is in richContent; validated + rendered server-side.
 *
 * Allowed top-level structure: { type: "doc", content: [...nodes] }
 * All deeper validation is done by layout-schema.ts + visual-template-security-review.ts.
 */
export interface ProseMirrorDocJson {
  type: "doc";
  content?: unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Body text section block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Free-form body text with optional ERP binding placeholders.
 * Bindings use {{namespace.field}} syntax and are resolved server-side.
 * Maps to ExecutiveLedgerBodySection at render time.
 *
 * UX.1: richContent (ProseMirror JSON) takes priority over legacy content string.
 * Backward compat: content is still accepted for existing templates.
 */
export interface BodyTextSectionBlock {
  type: "BodyTextSectionBlock";
  props: {
    /** Optional section title */
    title?: string;
    /**
     * REPORT DESIGNER UX.1: Rich text content as ProseMirror JSON.
     * When present and valid, this takes priority over `content`.
     * Stored by the TipTap editor in the Puck property panel.
     * Nullable: Puck defaultProps and cleared legacy rows store null.
     */
    richContent?: ProseMirrorDocJson | null;
    /**
     * Legacy plain text body with optional {{binding}} placeholders.
     * Still used as fallback when richContent is absent.
     * Example: "This letter certifies that {{employee.full_name_en}} is employed..."
     * All placeholders are validated against ERP_BINDING_REGISTRY.
     */
    content: string;
    language?: "en" | "ar" | "bilingual";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Key-value section block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A key→value detail section with one or more label+binding pairs.
 * Maps to ExecutiveLedgerKeyValueSection at render time.
 */
export interface KeyValueSectionBlock {
  type: "KeyValueSectionBlock";
  props: {
    /** Optional section title, e.g. "Employee Details" */
    title?: string;
    /** Ordered list of field rows */
    fields: KeyValueFieldDef[];
  };
}

export interface KeyValueFieldDef {
  /** Static display label, e.g. "Employee Name" */
  label: string;
  /**
   * Data binding path from ERP_BINDING_REGISTRY, e.g. "employee.full_name_en".
   * Must be a key of ERP_BINDING_REGISTRY — unknown bindings fail validation.
   */
  binding: string;
  /** Render value in bold — for summary/total rows */
  emphasized?: boolean;
  /** Render as a sub-header within the section, no value shown */
  isSubHeader?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider block
// ─────────────────────────────────────────────────────────────────────────────

/** Visual horizontal rule between sections */
export interface DividerBlock {
  type: "DividerBlock";
  props: {
    /** Optional short label centered in the divider */
    label?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spacer block
// ─────────────────────────────────────────────────────────────────────────────

/** Adds vertical whitespace between blocks */
export interface SpacerBlock {
  type: "SpacerBlock";
  props: {
    /** Height in mm (4–40mm) */
    heightMm?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding header block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full company header (logo, company name, address, contact info).
 * All values are resolved from the template's branding profile — no user text.
 * Controlled entirely by the resolved ExportBrandingContext.
 */
export interface BrandingHeaderBlock {
  type: "BrandingHeaderBlock";
  props: {
    /** Whether to show company logo */
    showLogo?: boolean;
    /** Whether to show company legal name */
    showName?: boolean;
    /** Whether to show address block */
    showAddress?: boolean;
    /** Whether to show phone/email/website */
    showContact?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Company logo block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standalone logo placement.
 * Resolved from branding profile assets — never a user-supplied URL.
 */
export interface CompanyLogoBlock {
  type: "CompanyLogoBlock";
  props: {
    /** "report_logo" = primary A4 header logo, "small_logo" = compact footer logo */
    variant?: "report_logo" | "small_logo";
    align?: "left" | "center" | "right";
    /** Max height in mm (16–80mm) */
    maxHeightMm?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signatory block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signatory area — name, title, optional signature image.
 * Signature image requires `reports.sign` permission at resolution time.
 * Values come from branding profile unless overridden.
 */
export interface SignatoryBlock {
  type: "SignatoryBlock";
  props: {
    /** Show signature image (gated by reports.sign at render) */
    showSignature?: boolean;
    /** Override signatory name — if empty, uses branding profile value */
    nameOverride?: string;
    /** Override signatory title (EN) — if empty, uses branding profile value */
    titleOverrideEn?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamp block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Official stamp placement.
 * Stamp image requires `reports.sign` permission at resolution time.
 * Image resolved from branding profile — never a user-supplied URL.
 */
export interface StampBlock {
  type: "StampBlock";
  props: {
    align?: "left" | "center" | "right";
    /** Max size in mm (20–60mm) */
    sizeMm?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification QR block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public verification QR code placeholder.
 * Actual QR is generated at issuance time — not at design time.
 * Requires an approved/published template and `reports.publish` permission.
 *
 * The only allowed binding for this block is `document.qr_verification_url`.
 */
export interface VerificationQrBlock {
  type: "VerificationQrBlock";
  props: {
    /** Label below the QR code */
    label?: string;
    align?: "left" | "center" | "right";
    /** Size in mm (20–50mm) */
    sizeMm?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Table block (REPORT DESIGNER.8)
// ─────────────────────────────────────────────────────────────────────────────

/** Column configuration for ReportTableBlock */
export interface ReportTableColumnDef {
  /** Column key matching a key in the preview rows. Must be a safe plain identifier. */
  key: string;
  /** Display header label */
  label: string;
  /** Optional column width hint (e.g. "120px", "10%") */
  width?: string;
  align?: "left" | "center" | "right";
  /** How the cell value is formatted at render time */
  format?: "text" | "date" | "number" | "money" | "badge";
}

/**
 * Safe tabular data block driven by report preview rows.
 *
 * `dataSource` must be exactly `"report.preview_rows"` — the only approved source.
 * Column keys are plain identifiers only; no HTML, no expressions, no bindings.
 * All cell values pass HTML-escaping at render time.
 *
 * Only meaningful in Report Filters test mode or when `previewRows` are provided
 * to the mapper. Renders an empty state when no rows are available.
 */
export interface ReportTableBlock {
  type: "ReportTableBlock";
  props: {
    title?: string;
    /** Must be exactly "report.preview_rows" */
    dataSource: "report.preview_rows";
    /** Column definitions — keys must be safe plain identifiers */
    columns: ReportTableColumnDef[];
    /** Max rows to display — capped at 50. Default: 25. */
    maxRows?: number;
    showRowNumbers?: boolean;
    showHeader?: boolean;
    emptyText?: string;
    density?: "compact" | "normal";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Strip block (REPORT DESIGNER UX.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Allowed content types for a ColumnStripBlock slot */
export type ColumnSlotContentType =
  | "none"
  | "logo"
  | "heading"
  | "text"
  | "key_value"
  | "signatory"
  | "stamp"
  | "qr";

/**
 * A single slot inside a ColumnStripBlock.
 * Uses a flat structure for Puck prop compatibility.
 * contentType selects which block renders in this slot.
 */
export interface ColumnStripSlot {
  contentType: ColumnSlotContentType;

  // ── HeadingBlock slot ─────────────────────────────────────────────────────
  headingText?: string;
  headingLevel?: "h1" | "h2" | "h3";
  headingAlign?: "left" | "center" | "right";

  // ── BodyTextSectionBlock slot ─────────────────────────────────────────────
  bodyTitle?: string;
  bodyContent?: string;

  // ── KeyValueSectionBlock slot (single field) ──────────────────────────────
  kvTitle?: string;
  kvLabel?: string;
  kvBinding?: string;

  // ── CompanyLogoBlock slot ─────────────────────────────────────────────────
  logoVariant?: "report_logo" | "small_logo";
  logoAlign?: "left" | "center" | "right";
  logoMaxHeightMm?: number;

  // ── SignatoryBlock slot ───────────────────────────────────────────────────
  showSignature?: boolean;
  signatoryNameOverride?: string;
  signatoryTitleOverride?: string;

  // ── StampBlock slot ───────────────────────────────────────────────────────
  stampSizeMm?: number;
  stampAlign?: "left" | "center" | "right";

  // ── VerificationQrBlock slot ──────────────────────────────────────────────
  qrLabel?: string;
  qrSizeMm?: number;
  qrAlign?: "left" | "center" | "right";
}

/**
 * Controlled multi-column layout container.
 * Usable in Header, Body, and Footer zones.
 *
 * Fixed slot design: each slot holds exactly one block of a permitted type.
 * No nesting of ColumnStripBlocks allowed.
 * No ReportTableBlock or BrandingHeaderBlock in slots (full-width only).
 * No arbitrary width strings — layout presets only.
 *
 * Maps to ExecutiveLedgerColumnSection at render time.
 */
export interface ColumnStripBlock {
  type: "ColumnStripBlock";
  props: {
    /** Column layout preset */
    layout: "equal" | "left-wide" | "right-wide" | "2-col" | "3-col";
    /** Vertical alignment of slot contents */
    verticalAlign?: "top" | "middle" | "bottom";
    /** Gap between columns */
    gap?: "sm" | "md" | "lg";
    /** Left column slot */
    leftSlot?: ColumnStripSlot;
    /** Center column slot (only used in 3-col layout) */
    centerSlot?: ColumnStripSlot;
    /** Right column slot */
    rightSlot?: ColumnStripSlot;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout save / load DTOs
// ─────────────────────────────────────────────────────────────────────────────

/** Input to saveReportTemplateVisualLayout server action */
export interface SaveVisualLayoutInput {
  templateId: number;
  bodyLayout: ReportDesignerLayoutJson;
  headerLayout?: ReportDesignerLayoutJson;
  footerLayout?: ReportDesignerLayoutJson;
}

/** Result from getReportTemplateVisualLayout server action */
export interface VisualLayoutResult {
  templateId: number;
  templateName: string;
  templateCode: string;
  templateType: string;
  versionNo: number;
  governanceStatus: string;
  securityReviewStatus: string;
  isEditable: boolean;
  bodyLayout: ReportDesignerLayoutJson;
  headerLayout: ReportDesignerLayoutJson;
  footerLayout: ReportDesignerLayoutJson;
  visualEditorEngine: string;
  visualLayoutSchemaVersion: number;
  visualLayoutUpdatedAt: string | null;
  visualLayoutUpdatedBy: string | null;
}

/** Safe audit metadata for layout saves (never includes full layout JSON) */
export interface LayoutSaveAuditMeta {
  template_id: number;
  schema_version: number;
  engine: string;
  block_count: number;
  binding_count: number;
  block_type_summary: string[];
}
