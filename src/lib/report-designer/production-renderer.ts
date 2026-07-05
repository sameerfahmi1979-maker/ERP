/**
 * Report Designer — Production-Safe Visual Layout Renderer
 * Phase: REPORT DESIGNER.6 — Safe Renderer and Production Output Integration
 *
 * A pure server-side helper that converts visual template zones into:
 *  - A rendered HTML string (via Executive Ledger renderer)
 *  - An ExecutiveLedgerDocument (for passing to existing EL output adapters)
 *
 * SECURITY INVARIANTS:
 *  - Never writes to DB
 *  - Never creates QR tokens or erp_output_public_links rows
 *  - Never sends emails
 *  - All layout JSON validated via Zod before mapping
 *  - Binding values must be pre-resolved and pre-redacted by the caller
 *  - Falls back gracefully when no valid visual layout exists
 *
 * This module is server-side only — do NOT import in client components.
 */

import type { ExportBrandingContext } from "@/lib/export/export-types";
import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import {
  mapRawZonesToExecutiveLedgerDocument,
  mapReportDesignerZonesToExecutiveLedgerDocument,
} from "./layout-to-executive-ledger";
import type { ReportDesignerLayoutJson } from "./types";
import { EMPTY_LAYOUT } from "./types";
import { ReportDesignerLayoutJsonSchema } from "./layout-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductionRenderInput {
  /** Template display name — used as document title fallback */
  templateName: string;
  /** Template type — letter, certificate, report, etc. */
  templateType?: string;
  /** Raw header zone JSON — validated and parsed internally */
  headerLayoutRaw?: unknown;
  /** Raw body zone JSON — validated and parsed internally */
  bodyLayoutRaw?: unknown;
  /** Raw footer zone JSON — validated and parsed internally */
  footerLayoutRaw?: unknown;
  /** Already-resolved branding context */
  branding: ExportBrandingContext;
  /**
   * Pre-resolved, pre-redacted binding values.
   * Keys are ERP_BINDING_REGISTRY paths; values are display strings.
   * Caller is responsible for redacting sensitive values before passing here.
   */
  bindingValues: Record<string, string>;
}

export interface ProductionRenderResult {
  /** Whether the visual layout produced output (false = fallback to legacy rendering) */
  hasVisualLayout: boolean;
  /** Rendered HTML string — safe for iframe srcDoc */
  html: string;
  /** The ExecutiveLedgerDocument built from layout zones */
  document: ExecutiveLedgerDocument;
  /** Non-blocking warnings (unknown bindings, unsupported blocks, etc.) */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a raw JSON value is a valid non-empty ReportDesignerLayoutJson.
 * Returns the parsed layout if valid, or null if empty/invalid.
 */
export function parseVisualLayoutZone(raw: unknown): ReportDesignerLayoutJson | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = ReportDesignerLayoutJsonSchema.safeParse(raw);
  if (!parsed.success) return null;
  // Consider a layout "present" only if it has at least one content block
  if (!parsed.data.content || parsed.data.content.length === 0) return null;
  return parsed.data;
}

/**
 * Check if a template record has any valid visual layout content.
 * Returns true if at least one zone has blocks.
 */
export function templateHasVisualLayout(input: {
  visual_editor_engine?: string | null;
  header_layout_json?: unknown;
  body_layout_json?: unknown;
  footer_layout_json?: unknown;
}): boolean {
  if (!input.visual_editor_engine || input.visual_editor_engine !== "puck") return false;
  return (
    parseVisualLayoutZone(input.header_layout_json) !== null ||
    parseVisualLayoutZone(input.body_layout_json) !== null ||
    parseVisualLayoutZone(input.footer_layout_json) !== null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render visual template zones to an ExecutiveLedgerDocument and HTML string.
 *
 * If all three zones are empty/invalid, hasVisualLayout=false is returned and
 * the caller should fall back to existing (non-visual) rendering.
 *
 * This function is reused by:
 *  - Report Designer test preview (DESIGNER.5)
 *  - Official letter/certificate preview in LetterPreviewDialog (DESIGNER.6)
 *  - Future scheduled output adapters (DESIGNER.7+)
 */
export function renderVisualTemplateZones(
  input: ProductionRenderInput
): ProductionRenderResult {
  const {
    templateName,
    templateType,
    headerLayoutRaw,
    bodyLayoutRaw,
    footerLayoutRaw,
    branding,
    bindingValues,
  } = input;

  // Check if any zone has actual content
  const hasHeader = parseVisualLayoutZone(headerLayoutRaw) !== null;
  const hasBody = parseVisualLayoutZone(bodyLayoutRaw) !== null;
  const hasFooter = parseVisualLayoutZone(footerLayoutRaw) !== null;
  const hasVisualLayout = hasHeader || hasBody || hasFooter;

  if (!hasVisualLayout) {
    // Return a minimal fallback — caller must render via legacy pipeline
    const fallbackDoc: ExecutiveLedgerDocument = {
      documentTitle: templateName,
      branding,
      sections: [],
    };
    return {
      hasVisualLayout: false,
      html: renderExecutiveLedgerHtml(fallbackDoc),
      document: fallbackDoc,
      warnings: [
        "No visual layout blocks found in any zone. Using legacy template rendering.",
      ],
    };
  }

  const { document, warnings } = mapRawZonesToExecutiveLedgerDocument({
    templateName,
    templateType,
    headerLayoutRaw,
    bodyLayoutRaw,
    footerLayoutRaw,
    branding,
    bindingValues,
  });

  const html = renderExecutiveLedgerHtml(document);

  return { hasVisualLayout: true, html, document, warnings };
}

/**
 * Convenience overload: accepts already-parsed layout zone objects.
 * Useful when the caller has already validated and parsed the zones.
 */
export function renderVisualTemplateZonesParsed(input: {
  templateName: string;
  templateType?: string;
  headerLayout: ReportDesignerLayoutJson;
  bodyLayout: ReportDesignerLayoutJson;
  footerLayout: ReportDesignerLayoutJson;
  branding: ExportBrandingContext;
  bindingValues: Record<string, string>;
}): ProductionRenderResult {
  const { document, warnings } = mapReportDesignerZonesToExecutiveLedgerDocument({
    templateName: input.templateName,
    templateType: input.templateType,
    headerLayout: input.headerLayout,
    bodyLayout: input.bodyLayout,
    footerLayout: input.footerLayout,
    branding: input.branding,
    bindingValues: input.bindingValues,
  });

  const hasContent =
    document.sections.length > 0 ||
    !!document.branding?.companyNameEn ||
    !!document.signatoryOverride;

  const html = renderExecutiveLedgerHtml(document);

  return {
    hasVisualLayout: hasContent,
    html,
    document,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty layout fallback
// ─────────────────────────────────────────────────────────────────────────────

export { EMPTY_LAYOUT };
