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
export const CURRENT_LAYOUT_SCHEMA_VERSION = 1;

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
  | VerificationQrBlock;

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
// Body text section block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Free-form body text with optional ERP binding placeholders.
 * Bindings use {{namespace.field}} syntax and are resolved server-side.
 * Maps to ExecutiveLedgerBodySection at render time.
 */
export interface BodyTextSectionBlock {
  type: "BodyTextSectionBlock";
  props: {
    /** Optional section title */
    title?: string;
    /**
     * Body text with optional {{binding}} placeholders.
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
  templateType: string;
  governanceStatus: string;
  isEditable: boolean;
  bodyLayout: ReportDesignerLayoutJson;
  headerLayout: ReportDesignerLayoutJson;
  footerLayout: ReportDesignerLayoutJson;
  visualEditorEngine: string;
  visualLayoutSchemaVersion: number;
  visualLayoutUpdatedAt: string | null;
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
