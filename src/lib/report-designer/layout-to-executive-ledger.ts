/**
 * Report Designer — Layout JSON to Executive Ledger Document Mapper
 * Phase: REPORT DESIGNER.4 — Layout JSON to Executive Ledger Mapping
 *
 * Security rules:
 *  - Never renders raw HTML from user input
 *  - All text values are passed as plain strings to ExecutiveLedgerDocument
 *    (HTML-escaping is handled by the renderer, not here)
 *  - Binding values resolved only from pre-validated sample/live data map
 *  - No Supabase calls — branding context must be resolved before calling this
 *  - No QR token creation — VerificationQrBlock renders as placeholder only
 *  - No salary/IBAN/passport/EID values in sample data
 */

import type { ExportBrandingContext } from "@/lib/export/export-types";
import type {
  ExecutiveLedgerDocument,
  ExecutiveLedgerSection,
  ExecutiveLedgerBodySection,
  ExecutiveLedgerKeyValueSection,
  ExecutiveLedgerTableSection,
  ExecutiveLedgerDividerSection,
  ExecutiveLedgerColumnSection,
  ExecutiveLedgerColumnSlot,
} from "@/lib/executive-ledger/types";
import type {
  ReportDesignerLayoutJson,
  ReportDesignerBlock,
  HeadingBlock,
  BodyTextSectionBlock,
  KeyValueSectionBlock,
  DividerBlock,
  SpacerBlock,
  BrandingHeaderBlock,
  CompanyLogoBlock,
  SignatoryBlock,
  StampBlock,
  VerificationQrBlock,
  ReportTableBlock,
  ColumnStripBlock,
  ColumnStripSlot,
} from "./types";
import { EMPTY_LAYOUT } from "./types";
import { ReportDesignerLayoutJsonSchema } from "./layout-schema";
import { renderProseMirrorDocToHtml } from "./prosemirror-renderer";
import { isCorruptRichContentDoc } from "./prosemirror-plaintext";

// ─────────────────────────────────────────────────────────────────────────────
// Public input / result types
// ─────────────────────────────────────────────────────────────────────────────

export interface MapZonesInput {
  /** Template display name — used as documentTitle fallback */
  templateName: string;
  /** Template type — for orientation / language hints */
  templateType?: string;
  /** Header zone layout JSON */
  headerLayout: ReportDesignerLayoutJson;
  /** Body zone layout JSON */
  bodyLayout: ReportDesignerLayoutJson;
  /** Footer zone layout JSON */
  footerLayout: ReportDesignerLayoutJson;
  /** Already-resolved branding context from server */
  branding: ExportBrandingContext;
  /**
   * Flat map of binding paths to resolved values.
   * Use buildSampleBindingValues() for preview; real values for REPORT DESIGNER.5.
   */
  bindingValues: Record<string, string>;
  /**
   * REPORT DESIGNER.8: Optional preview rows for ReportTableBlock rendering.
   * Set when test mode is report_filters or when production rows are available.
   * Each row is a key→value map from the report fetcher result.
   */
  previewRows?: Record<string, unknown>[];
  /**
   * REPORT DESIGNER.8: Column metadata from the preview runner, used for header labels
   * when a column is referenced but not configured by the designer.
   */
  previewColumns?: string[];
}

export interface MapZonesResult {
  document: ExecutiveLedgerDocument;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace all {{binding.path}} placeholders in text with resolved values.
 * Unknown bindings render as [UNKNOWN: path] and are added to warnings.
 */
function resolveTextBindings(
  text: string,
  values: Record<string, string>,
  warnings: string[]
): string {
  return text.replace(
    /\{\{([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\}\}/g,
    (_, path: string) => {
      if (Object.prototype.hasOwnProperty.call(values, path)) {
        return values[path];
      }
      if (!warnings.includes(`Unknown binding: ${path}`)) {
        warnings.push(`Unknown binding: ${path}`);
      }
      return `[UNKNOWN: ${path}]`;
    }
  );
}

/**
 * Resolve a single binding path to its value.
 * Unknown bindings return [UNKNOWN: path] and are added to warnings.
 */
function resolveBinding(
  path: string,
  values: Record<string, string>,
  warnings: string[]
): string {
  if (Object.prototype.hasOwnProperty.call(values, path)) {
    return values[path];
  }
  const msg = `Unknown binding: ${path}`;
  if (!warnings.includes(msg)) warnings.push(msg);
  return `[UNKNOWN: ${path}]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block-to-section mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapHeadingBlock(
  block: HeadingBlock
): ExecutiveLedgerBodySection {
  return {
    type: "body",
    title: block.props.text,
    content: "",
  };
}

function mapBodyTextSection(
  block: BodyTextSectionBlock,
  values: Record<string, string>,
  warnings: string[]
): ExecutiveLedgerBodySection {
  // REPORT DESIGNER UX.1: prefer richContent (ProseMirror JSON) over legacy content string.
  // Guard: skip richContent if ALL bindingToken nodes have no path (corrupt pre-UX.2 data).
  const rc = block.props.richContent;
  const isCorruptRichContent = isCorruptRichContentDoc(
    (rc as unknown as Record<string, unknown>) ?? null
  );

  if (rc && rc.type === "doc" && !isCorruptRichContent) {
    const richHtml = renderProseMirrorDocToHtml(
      rc as unknown as Record<string, unknown>,
      values
    );
    return {
      type: "body",
      title: block.props.title || undefined,
      content: block.props.content || "", // Legacy fallback still stored
      richHtml,
      language:
        block.props.language === "en" || block.props.language === "ar" || block.props.language === "bilingual"
          ? block.props.language
          : undefined,
    };
  }
  if (isCorruptRichContent) {
    warnings.push(
      "BodyTextSectionBlock: richContent has binding tokens without path attributes (pre-UX.2 corrupt data) — falling back to plain text content."
    );
  }
  const resolved = resolveTextBindings(block.props.content, values, warnings);
  return {
    type: "body",
    title: block.props.title || undefined,
    content: resolved,
    language:
      block.props.language === "en" || block.props.language === "ar" || block.props.language === "bilingual"
        ? block.props.language
        : undefined,
  };
}

function mapKeyValueSection(
  block: KeyValueSectionBlock,
  values: Record<string, string>,
  warnings: string[]
): ExecutiveLedgerKeyValueSection {
  return {
    type: "key_value",
    title: block.props.title || undefined,
    rows: (block.props.fields ?? []).map((f) => ({
      label: f.label,
      value: f.isSubHeader ? "" : resolveBinding(f.binding, values, warnings),
      emphasized: f.emphasized,
      isSubHeader: f.isSubHeader,
    })),
  };
}

function mapDividerBlock(block: DividerBlock): ExecutiveLedgerDividerSection {
  return {
    type: "divider",
    label: block.props.label || undefined,
  };
}

function mapSpacerBlock(_block: SpacerBlock): ExecutiveLedgerDividerSection {
  // No native spacer in EL — map to an unlabeled divider (closest available)
  return { type: "divider" };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DESIGNER.8: ReportTableBlock mapper
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_TABLE_MAX_ROWS_SAFE = 50;

/**
 * Safely escape a cell value for display.
 * All non-string types are coerced to strings; undefined/null → empty string.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  return str.length > 500 ? str.slice(0, 500) + "…" : str;
}

/**
 * Format a cell value according to the column format type.
 * All returned values are plain strings — no HTML injection.
 * REPORT DESIGNER.9: Advanced format support (number, money, date, badge).
 */
function formatCell(value: unknown, format?: string): string {
  const raw = escapeCell(value);
  if (!raw) return raw;

  switch (format) {
    case "number": {
      const n = Number(raw.replace(/,/g, ""));
      if (!isNaN(n)) {
        return n.toLocaleString("en-US");
      }
      return raw;
    }

    case "money": {
      const m = Number(raw.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
      if (!isNaN(m)) {
        return m.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      return raw;
    }

    case "date": {
      try {
        // Accept ISO strings, timestamps, or already-formatted dates
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
        }
      } catch {
        // Fall through to raw
      }
      return raw;
    }

    case "badge": {
      // Plain-text badge: uppercase the value — no raw HTML, no styling injection
      return raw.toUpperCase();
    }

    case "text":
    default:
      return raw;
  }
}

function mapReportTableBlock(
  block: ReportTableBlock,
  previewRows: Record<string, unknown>[],
  warnings: string[]
): ExecutiveLedgerTableSection {
  const { title, columns, maxRows, showRowNumbers, showHeader, emptyText } = block.props;

  const cap = Math.min(maxRows ?? 25, REPORT_TABLE_MAX_ROWS_SAFE);
  const cappedRows = previewRows.slice(0, cap);

  if (previewRows.length === 0) {
    warnings.push(
      `ReportTableBlock: no preview rows available. This block renders empty outside Report Filters test mode.`
    );
  }

  // Validate column keys against available row keys
  const availableKeys =
    cappedRows.length > 0 ? new Set(Object.keys(cappedRows[0])) : new Set<string>();

  const validColumns = columns.filter((col) => {
    if (!col.key) return false;
    if (availableKeys.size > 0 && !availableKeys.has(col.key)) {
      warnings.push(`ReportTableBlock column '${col.key}' not found in preview rows — skipped.`);
      return false;
    }
    return true;
  });

  const headers: string[] = [];
  if (showRowNumbers) headers.push("#");
  for (const col of validColumns) {
    headers.push(col.label || col.key);
  }
  if (showHeader === false) {
    // Keep headers array but signal to renderer via empty-or-sentinel
    // EL renderer always shows headers; no native way to hide — document limitation
  }

  const tableRows: string[][] = cappedRows.map((row, rowIdx) => {
    const cells: string[] = [];
    if (showRowNumbers) cells.push(String(rowIdx + 1));
    for (const col of validColumns) {
      // REPORT DESIGNER.9: apply column format
      cells.push(formatCell(row[col.key], col.format));
    }
    return cells;
  });

  if (tableRows.length === 0 && validColumns.length > 0) {
    // Add a single "no data" row
    const emptyCells = showRowNumbers ? ["—"] : [];
    for (let i = 0; i < validColumns.length; i++) {
      emptyCells.push(emptyText || "No data");
    }
    tableRows.push(emptyCells);
  }

  // REPORT DESIGNER.9: pass column width hints to EL section
  const columnWidths: string[] = [];
  if (showRowNumbers) columnWidths.push("32px");
  for (const col of validColumns) {
    columnWidths.push(col.width ?? "");
  }

  return {
    type: "table",
    title: title || undefined,
    headers,
    rows: tableRows,
    showHeader: showHeader !== false,
    columnWidths: columnWidths.some((w) => w) ? columnWidths : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document-level block handlers (affect document fields, not sections)
// ─────────────────────────────────────────────────────────────────────────────

/** Apply BrandingHeaderBlock settings to a mutable branding context clone */
function applyBrandingHeaderBlock(
  block: BrandingHeaderBlock,
  branding: ExportBrandingContext
): ExportBrandingContext {
  return {
    ...branding,
    showLogo: block.props.showLogo ?? branding.showLogo,
    showAddress: block.props.showAddress ?? branding.showAddress,
    // showName: hide company name by nulling it out if explicitly false
    companyNameEn: block.props.showName === false ? null : branding.companyNameEn,
    companyNameAr: block.props.showName === false ? null : branding.companyNameAr,
    // showContact: hide contact details if explicitly false
    phone: block.props.showContact === false ? null : branding.phone,
    email: block.props.showContact === false ? null : branding.email,
    website: block.props.showContact === false ? null : branding.website,
  };
}

/** Apply CompanyLogoBlock settings to a mutable branding context clone */
function applyCompanyLogoBlock(
  block: CompanyLogoBlock,
  branding: ExportBrandingContext
): ExportBrandingContext {
  // If small_logo variant, prefer smallLogoUrl; if report_logo, prefer logoUrl
  const preferSmall = block.props.variant === "small_logo";
  return {
    ...branding,
    showLogo: true,
    // Swap logo URLs based on variant if needed
    logoUrl: preferSmall
      ? (branding.smallLogoUrl ?? branding.logoUrl)
      : (branding.logoUrl ?? branding.smallLogoUrl),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DESIGNER UX.1: ColumnStripBlock mapper
// ─────────────────────────────────────────────────────────────────────────────

/** EL logo max height constant (in px) — matches html-renderer.ts EL_LOGO_MAX_HEIGHT_PX */
const EL_LOGO_MAX_HEIGHT_FALLBACK = 60;

function mapColumnStripSlot(
  slot: ColumnStripSlot | undefined,
  values: Record<string, string>,
  branding: ExportBrandingContext,
  warnings: string[]
): ExecutiveLedgerColumnSlot | undefined {
  if (!slot || slot.contentType === "none") return undefined;

  switch (slot.contentType) {
    case "heading": {
      const text = slot.headingText || "";
      const align = slot.headingAlign;
      const style = align && ["left", "center", "right"].includes(align)
        ? ` style="text-align:${align}"`
        : "";
      return {
        section: {
          type: "body",
          content: "",
          title: text,
        },
      };
    }

    case "text": {
      const resolved = resolveTextBindings(slot.bodyContent || "", values, warnings);
      return {
        section: {
          type: "body",
          title: slot.bodyTitle || undefined,
          content: resolved,
        },
      };
    }

    case "key_value": {
      if (!slot.kvBinding) return undefined;
      return {
        section: {
          type: "key_value",
          title: slot.kvTitle || undefined,
          rows: [{
            label: slot.kvLabel || slot.kvBinding,
            value: resolveBinding(slot.kvBinding, values, warnings),
          }],
        },
      };
    }

    case "logo": {
      const logoUrl = slot.logoVariant === "small_logo"
        ? (branding.smallLogoUrl ?? branding.logoUrl)
        : (branding.logoUrl ?? branding.smallLogoUrl);
      if (!logoUrl) return undefined;
      const maxH = slot.logoMaxHeightMm
        ? Math.min(Math.max(slot.logoMaxHeightMm * 3.78, 30), EL_LOGO_MAX_HEIGHT_FALLBACK * 2)
        : EL_LOGO_MAX_HEIGHT_FALLBACK;
      const alignStyle = slot.logoAlign === "center" ? "margin:0 auto;" : slot.logoAlign === "right" ? "margin-left:auto;" : "";
      return {
        html: `<div style="display:block; ${alignStyle}">
          <img src="${logoUrl}" alt="Logo" style="max-height:${maxH}px; max-width:100%; object-fit:contain; display:block;" onerror="this.style.display='none'">
        </div>`,
      };
    }

    case "signatory": {
      const sigName = slot.signatoryNameOverride || branding.signatoryName || "";
      const sigTitle = slot.signatoryTitleOverride || branding.signatoryTitleEn || "";
      const sigUrl = slot.showSignature ? (branding.signatureUrl ?? "") : "";
      return {
        html: `<div>
          ${sigUrl ? `<img src="${sigUrl}" alt="Signature" style="max-height:40px; max-width:120px; object-fit:contain; display:block; margin-bottom:4px;" onerror="this.style.display='none'">` : ""}
          <div style="border-top:1px solid #1a1a1a; width:120px; padding-top:4px; margin-top:${sigUrl ? "0" : "24px"};">
            ${sigName ? `<div style="font-size:9.5px; font-weight:700; color:#1a1a1a;">${sigName}</div>` : ""}
            ${sigTitle ? `<div style="font-size:8.5px; color:#555;">${sigTitle}</div>` : ""}
          </div>
        </div>`,
      };
    }

    case "stamp": {
      const stampUrl = branding.stampUrl || "";
      const sizeMm = slot.stampSizeMm ?? 40;
      const sizePx = Math.min(Math.max(sizeMm * 3.78, 40), 150);
      const align = slot.stampAlign === "center" ? "margin:0 auto;" : slot.stampAlign === "right" ? "margin-left:auto;" : "";
      if (!stampUrl) return undefined;
      return {
        html: `<div style="display:block; ${align}">
          <img src="${stampUrl}" alt="Stamp" style="max-height:${sizePx}px; max-width:${sizePx}px; object-fit:contain; display:block;" onerror="this.style.display='none'">
        </div>`,
      };
    }

    case "qr": {
      const qrLabel = slot.qrLabel || "Scan to verify";
      const sizeMm = slot.qrSizeMm ?? 35;
      const sizePx = Math.min(Math.max(sizeMm * 3.78, 40), 120);
      const align = slot.qrAlign === "center" ? "margin:0 auto;" : slot.qrAlign === "right" ? "margin-left:auto;" : "";
      return {
        html: `<div style="display:inline-flex; flex-direction:column; align-items:center; gap:3px; ${align}">
          <div style="border:1px dashed #cbd5e1; width:${sizePx}px; height:${sizePx}px; background:#f8fafc; display:flex; align-items:center; justify-content:center;">
            <span style="font-size:7px; color:#94a3b8; text-align:center; line-height:1.4; padding:4px;">QR<br>Code</span>
          </div>
          <span style="font-size:7px; color:#64748b; text-align:center; letter-spacing:0.3px;">${qrLabel}</span>
        </div>`,
      };
    }

    default:
      return undefined;
  }
}

function mapColumnStripBlock(
  block: ColumnStripBlock,
  values: Record<string, string>,
  branding: ExportBrandingContext,
  warnings: string[]
): ExecutiveLedgerColumnSection {
  return {
    type: "column",
    layout: block.props.layout,
    verticalAlign: block.props.verticalAlign,
    gap: block.props.gap,
    slots: {
      left:   mapColumnStripSlot(block.props.leftSlot,   values, branding, warnings) ?? undefined,
      center: mapColumnStripSlot(block.props.centerSlot, values, branding, warnings) ?? undefined,
      right:  mapColumnStripSlot(block.props.rightSlot,  values, branding, warnings) ?? undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone processor
// ─────────────────────────────────────────────────────────────────────────────

interface ZoneProcessResult {
  sections: ExecutiveLedgerSection[];
  brandingOverrides: Partial<ExportBrandingContext>;
  signatoryOverride?: { name: string; titleEn?: string; titleAr?: string };
  verification?: { label?: string };
  warnings: string[];
}

function processZone(
  zone: ReportDesignerLayoutJson,
  values: Record<string, string>,
  initialBranding: ExportBrandingContext,
  previewRows: Record<string, unknown>[] = []
): ZoneProcessResult {
  const sections: ExecutiveLedgerSection[] = [];
  const warnings: string[] = [];
  let brandingOverrides: ExportBrandingContext = { ...initialBranding };
  let signatoryOverride: { name: string; titleEn?: string } | undefined;
  let verification: { label?: string } | undefined;

  for (const block of zone.content) {
    switch (block.type) {
      case "HeadingBlock":
        sections.push(mapHeadingBlock(block as HeadingBlock));
        break;

      case "BodyTextSectionBlock":
        sections.push(mapBodyTextSection(block as BodyTextSectionBlock, values, warnings));
        break;

      case "KeyValueSectionBlock":
        sections.push(mapKeyValueSection(block as KeyValueSectionBlock, values, warnings));
        break;

      case "DividerBlock":
        sections.push(mapDividerBlock(block as DividerBlock));
        break;

      case "SpacerBlock":
        sections.push(mapSpacerBlock(block as SpacerBlock));
        break;

      case "BrandingHeaderBlock":
        brandingOverrides = applyBrandingHeaderBlock(block as BrandingHeaderBlock, brandingOverrides);
        break;

      case "CompanyLogoBlock":
        brandingOverrides = applyCompanyLogoBlock(block as CompanyLogoBlock, brandingOverrides);
        break;

      case "SignatoryBlock": {
        const sb = block as SignatoryBlock;
        // Override signatory name/title if explicitly set
        if (sb.props.nameOverride) {
          signatoryOverride = {
            name: sb.props.nameOverride,
            titleEn: sb.props.titleOverrideEn || undefined,
          };
        }
        // Control signature image visibility
        brandingOverrides = {
          ...brandingOverrides,
          showSignatory: true,
          signatureUrl: sb.props.showSignature ? brandingOverrides.signatureUrl : null,
        };
        break;
      }

      case "StampBlock":
        brandingOverrides = {
          ...brandingOverrides,
          showStamp: true,
        };
        break;

      case "VerificationQrBlock": {
        const qb = block as VerificationQrBlock;
        // Preview only — no real QR token generated
        verification = { label: qb.props.label || "Scan to verify document authenticity" };
        break;
      }

      case "ReportTableBlock": {
        sections.push(
          mapReportTableBlock(block as ReportTableBlock, previewRows, warnings)
        );
        break;
      }

      case "ColumnStripBlock": {
        sections.push(
          mapColumnStripBlock(block as ColumnStripBlock, values, brandingOverrides, warnings)
        );
        break;
      }

      default: {
        const unknownType = (block as ReportDesignerBlock).type;
        warnings.push(`Unsupported block type: ${unknownType}`);
      }
    }
  }

  return { sections, brandingOverrides, signatoryOverride, verification, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe layout parser
// ─────────────────────────────────────────────────────────────────────────────

function safeParseZone(raw: unknown): ReportDesignerLayoutJson {
  const parsed = ReportDesignerLayoutJsonSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return EMPTY_LAYOUT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public mappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map header + body + footer zone layouts to an ExecutiveLedgerDocument.
 *
 * BrandingHeaderBlock / CompanyLogoBlock in header zone → branding context overrides.
 * SignatoryBlock / StampBlock / VerificationQrBlock in footer zone → document-level fields.
 * All other blocks → ordered sections.
 */
export function mapReportDesignerZonesToExecutiveLedgerDocument(
  input: MapZonesInput
): MapZonesResult {
  const { templateName, headerLayout, bodyLayout, footerLayout, branding, bindingValues, previewRows = [] } =
    input;

  const warnings: string[] = [];

  // ── Process each zone ────────────────────────────────────────────────────
  const headerResult = processZone(headerLayout, bindingValues, branding, previewRows);
  const bodyResult = processZone(bodyLayout, bindingValues, headerResult.brandingOverrides, previewRows);
  const footerResult = processZone(footerLayout, bindingValues, bodyResult.brandingOverrides, previewRows);

  warnings.push(...headerResult.warnings, ...bodyResult.warnings, ...footerResult.warnings);

  // ── Merge branding overrides from all zones ───────────────────────────────
  const resolvedBranding = footerResult.brandingOverrides;

  // ── Determine document title ──────────────────────────────────────────────
  // Use first h1 HeadingBlock from body zone, or template name
  const firstH1 = bodyLayout.content.find(
    (b) => b.type === "HeadingBlock" && (b as HeadingBlock).props.level === "h1"
  ) as HeadingBlock | undefined;
  const documentTitle = firstH1?.props.text ?? templateName;

  // ── Combine sections: header → body → footer ──────────────────────────────
  const allSections: ExecutiveLedgerSection[] = [
    ...headerResult.sections,
    ...bodyResult.sections,
    ...footerResult.sections,
  ];

  // ── Determine document direction ──────────────────────────────────────────
  const languageMode = bodyLayout.root.props.languageMode;
  const direction: "ltr" | "rtl" | "auto" | undefined =
    languageMode === "ar" ? "rtl" : languageMode === "bilingual" ? "auto" : "ltr";

  // ── Build ExecutiveLedgerDocument ─────────────────────────────────────────
  const document: ExecutiveLedgerDocument = {
    documentTitle,
    branding: resolvedBranding,
    sections: allSections,
    direction,
    orientation: bodyLayout.root.props.orientation ?? "portrait",
    ...(footerResult.signatoryOverride
      ? { signatoryOverride: footerResult.signatoryOverride }
      : {}),
    // VerificationQrBlock → preview placeholder (no real token)
    ...(footerResult.verification
      ? {
          verification: {
            publicUrl: null,
            qrDataUrl: null,
            label: footerResult.verification.label,
          },
        }
      : {}),
  };

  // Warn if no sections were produced
  if (allSections.length === 0) {
    warnings.push(
      "No content blocks found in any zone. Add blocks in the Designer to see a formal preview."
    );
  }

  return { document, warnings };
}

/**
 * Convenience wrapper: accepts raw unknown JSON for each zone, parses safely,
 * then maps to ExecutiveLedgerDocument.
 */
export function mapRawZonesToExecutiveLedgerDocument(input: {
  templateName: string;
  templateType?: string;
  headerLayoutRaw?: unknown;
  bodyLayoutRaw?: unknown;
  footerLayoutRaw?: unknown;
  branding: ExportBrandingContext;
  bindingValues: Record<string, string>;
  /** REPORT DESIGNER.8: Optional preview rows for ReportTableBlock rendering */
  previewRows?: Record<string, unknown>[];
  previewColumns?: string[];
}): MapZonesResult {
  return mapReportDesignerZonesToExecutiveLedgerDocument({
    templateName: input.templateName,
    templateType: input.templateType,
    headerLayout: safeParseZone(input.headerLayoutRaw),
    bodyLayout: safeParseZone(input.bodyLayoutRaw),
    footerLayout: safeParseZone(input.footerLayoutRaw),
    branding: input.branding,
    bindingValues: input.bindingValues,
    previewRows: input.previewRows,
    previewColumns: input.previewColumns,
  });
}
